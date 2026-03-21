const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const compression = require('compression');

const defaultConfig = require('./config.cjs');
const { createUserRepository } = require('./repositories/index.cjs');
const { createCurriculumCatalog } = require('./services/curriculumCatalog.cjs');
const { buildMapPayload: buildMapPayloadFromCatalog } = require('./services/mapService.cjs');
const { toggleSubjectProgress } = require('./services/progressService.cjs');
const {
  getPasswordSecurityMessage,
  hasResolvableEmailDomain,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  verifyPassword,
} = require('./security.cjs');

const curriculumCatalog = createCurriculumCatalog();

function buildMapPayload(user, selectedCourseId) {
  return buildMapPayloadFromCatalog(user, selectedCourseId, curriculumCatalog);
}

function buildCurriculumSummary() {
  return curriculumCatalog.getSummaryList();
}

function sanitizeUser(user) {
  const fallbackUsername = String(user.name || '')
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase() || 'usuario';

  return {
    id: user.id,
    name: user.name,
    username: user.username || fallbackUsername,
    registration: user.registration,
    email: user.email,
    courseId: user.courseId,
    avatarUrl: user.avatarUrl || '',
    preferences: {
      theme: user.preferences?.theme || 'brand',
    },
  };
}

function getTokenFromRequest(req) {
  const authorization = req.headers.authorization || '';

  if (!authorization.startsWith('Bearer ')) {
    return '';
  }

  return authorization.slice(7);
}

function createApp({
  userRepository = createUserRepository(),
  config = defaultConfig,
  emailDomainValidator = hasResolvableEmailDomain,
} = {}) {
  const app = express();

  app.use(cors());
  app.use(compression({ threshold: '2kb' }));
  app.use(express.json({ limit: '8mb' }));

  async function getAuthenticatedUser(req) {
    const token = getTokenFromRequest(req);

    if (!token) {
      return null;
    }

    return userRepository.findByToken(token);
  }

  async function validateRegistrationInput(body) {
    const { name, registration, email, password, courseId } = body;

    if (!name || !registration || !email || !password || !courseId) {
      return 'Preencha todos os campos.';
    }

    if (!curriculumCatalog.getCourse(courseId)) {
      return 'Curso invalido.';
    }

    if (!isValidEmail(email)) {
      return 'Informe um e-mail valido.';
    }

    if (!(await emailDomainValidator(email))) {
      return 'O dominio do e-mail nao pode ser validado.';
    }

    const passwordError = getPasswordSecurityMessage(password);
    if (passwordError) {
      return passwordError;
    }

    return '';
  }

  async function validateProfileUpdate(user, body) {
    const nextName = String(body.name || '').trim();
    const nextUsername = String(body.username || '').trim();
    const nextEmail = String(body.email || '').trim().toLowerCase();
    const nextAvatarUrl = String(body.avatarUrl || '').trim();
    const nextTheme = String(body.theme || '').trim() || 'brand';

    if (nextName.length < 3) {
      return 'Informe um nome valido.';
    }

    if (nextUsername.length < 3) {
      return 'O nome de usuario deve ter pelo menos 3 caracteres.';
    }

    if (!isValidEmail(nextEmail)) {
      return 'Informe um e-mail valido.';
    }

    if (!(await emailDomainValidator(nextEmail))) {
      return 'O dominio do e-mail nao pode ser validado.';
    }

    if (!['brand', 'dark', 'white'].includes(nextTheme)) {
      return 'Tema invalido.';
    }

    if (nextAvatarUrl && !nextAvatarUrl.startsWith('data:image/')) {
      return 'Use o upload de imagem para definir a foto de perfil.';
    }

    const existingEmail = await userRepository.findByEmail(nextEmail);
    if (existingEmail && existingEmail.id !== user.id) {
      return 'E-mail ja cadastrado.';
    }

    return '';
  }

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      storageDriver: config.storageDriver,
    });
  });

  app.get('/api/curriculums', (req, res) => {
    res.json(buildCurriculumSummary());
  });

  app.post('/api/auth/register', async (req, res) => {
    const validationError = await validateRegistrationInput(req.body);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { name, registration, email, password, courseId } = req.body;
    const normalizedRegistration = String(registration).trim();
    const normalizedEmail = normalizeEmail(email);

    const existingRegistration = await userRepository.findByRegistration(normalizedRegistration);
    if (existingRegistration) {
      return res.status(409).json({ error: 'Matricula ja cadastrada.' });
    }

    const existingEmail = await userRepository.findByEmail(normalizedEmail);
    if (existingEmail) {
      return res.status(409).json({ error: 'E-mail ja cadastrado.' });
    }

    const user = {
      id: crypto.randomUUID(),
      name: String(name).trim(),
      username: String(name).trim().split(/\s+/)[0].toLowerCase(),
      registration: normalizedRegistration,
      email: normalizedEmail,
      courseId,
      avatarUrl: '',
      passwordHash: hashPassword(String(password)),
      sessionToken: crypto.randomUUID(),
      preferences: {
        theme: 'brand',
      },
      progress: {
        [courseId]: [],
      },
    };

    await userRepository.create(user);

    return res.status(201).json({
      token: user.sessionToken,
      user: sanitizeUser(user),
    });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { registration, password } = req.body;

    if (!registration || !password) {
      return res.status(400).json({ error: 'Informe matricula e senha.' });
    }

    const normalizedRegistration = String(registration).trim();
    const user = await userRepository.findByRegistration(normalizedRegistration);

    if (!user || !verifyPassword(String(password), user.passwordHash)) {
      return res.status(401).json({ error: 'Credenciais invalidas.' });
    }

    const sessionToken = crypto.randomUUID();
    const updatedUser = await userRepository.updateById(user.id, {
      ...user,
      sessionToken,
    });

    return res.json({
      token: updatedUser.sessionToken,
      user: sanitizeUser(updatedUser),
    });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(204).send();
    }

    await userRepository.updateByToken(token, (user) => ({
      ...user,
      sessionToken: '',
    }));

    return res.status(204).send();
  });

  app.get('/api/auth/me', async (req, res) => {
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({ error: 'Sessao invalida.' });
    }

    return res.json({ user: sanitizeUser(user) });
  });

  app.patch('/api/profile', async (req, res) => {
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({ error: 'Sessao invalida.' });
    }

    const validationError = await validateProfileUpdate(user, req.body);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const updatedUser = await userRepository.updateById(user.id, {
      ...user,
      name: String(req.body.name).trim(),
      username: String(req.body.username).trim(),
      email: String(req.body.email).trim().toLowerCase(),
      courseId: user.courseId,
      avatarUrl: String(req.body.avatarUrl || '').trim(),
      preferences: {
        ...user.preferences,
        theme: String(req.body.theme || 'brand').trim(),
      },
    });

    return res.json({ user: sanitizeUser(updatedUser) });
  });

  app.get('/api/map', async (req, res) => {
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({ error: 'Sessao invalida.' });
    }

    return res.json(buildMapPayload(user, req.query.courseId));
  });

  app.post('/api/progress/toggle', async (req, res) => {
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({ error: 'Sessao invalida.' });
    }

    const progressResult = toggleSubjectProgress(user, req.body, curriculumCatalog);

    if (progressResult.error) {
      return res.status(progressResult.status).json({ error: progressResult.error });
    }

    const updatedUser = await userRepository.updateById(user.id, {
      ...user,
      progress: {
        ...user.progress,
        [progressResult.courseId]: progressResult.progress,
      },
    });

    return res.json(buildMapPayload(updatedUser, progressResult.courseId));
  });

  app.use('/api', (req, res) => {
    return res.status(404).json({ error: 'Rota da API nao encontrada.' });
  });

  app.use((error, req, res, next) => {
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'A imagem enviada e grande demais. Use uma foto menor.' });
    }

    if (error instanceof SyntaxError && 'body' in error) {
      return res.status(400).json({ error: 'Requisicao invalida.' });
    }

    return next(error);
  });

  return app;
}

module.exports = {
  buildMapPayload,
  buildCurriculumSummary,
  createApp,
  sanitizeUser,
};
