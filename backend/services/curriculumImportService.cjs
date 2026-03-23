const crypto = require('crypto');
const mammoth = require('mammoth');

const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'json', 'md']);
const DOCX_EXTENSIONS = new Set(['docx']);
const PDF_EXTENSIONS = new Set(['pdf']);
const DEFAULT_MISTRAL_MODEL = 'mistral-small-latest';
const DEFAULT_MISTRAL_OCR_MODEL = 'mistral-ocr-latest';
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMPORT_MIME_TYPES = new Set([
  'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'text/markdown',
  'text/plain',
]);

const curriculumSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'code', 'trailLabels', 'subjects'],
  properties: {
    id: { type: 'string' },
    code: { type: 'string' },
    baseCode: { type: 'string' },
    name: { type: 'string' },
    catalogName: { type: 'string' },
    catalogKey: { type: 'string' },
    academicYear: { type: 'integer' },
    versionLabel: { type: 'string' },
    trailLabels: {
      type: 'array',
      items: { type: 'string' },
    },
    subjects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'semester', 'trail', 'prerequisites', 'corequisites'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          semester: { type: 'integer' },
          trail: { type: 'string' },
          prerequisites: {
            type: 'array',
            items: { type: 'string' },
          },
          corequisites: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  },
};

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || '')
    .split(/[|,;/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeSubjectId(value, fallback) {
  return String(value || fallback || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function normalizeReferenceIds(value) {
  return uniqueList(normalizeList(value).map((item) => normalizeSubjectId(item)).filter(Boolean));
}

function stripAccents(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeLooseText(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function extractReferenceCodesFromText(value) {
  const matches = String(value || '').toUpperCase().match(/\b[A-Z]{2,}\s*[-.]?\s*\d{2,}[A-Z0-9-]*\b/g) || [];
  return uniqueList(matches.map((item) => normalizeSubjectId(item)).filter(Boolean));
}

function extractSemesterNumber(line) {
  const normalized = normalizeLooseText(line);
  const match = normalized.match(/\b(\d{1,2})\s*(?:o|º|°)?\s*(?:semestre|periodo|periodo letivo|modulo|fase|bloco)\b/);

  if (match) {
    return Number(match[1]);
  }

  return null;
}

function isLikelySubjectCode(value) {
  return /^(?:[A-Z]{2,}[-.]?\d{2,}[A-Z0-9-]*|\d{5,}[A-Z0-9-]*)$/.test(normalizeSubjectId(value));
}

function cleanupSubjectName(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\b(?:ch|carga horaria|creditos?)\b.*$/i, '')
    .replace(/\b(?:pre[- ]?requisitos?|pre[- ]?requisito|co[- ]?requisitos?|co[- ]?requisito|correquisitos?|correquisito)\b.*$/i, '')
    .replace(/^[\-:|]+/, '')
    .trim();
}

function extractSubjectFromTableLine(line, semester) {
  if (!line.includes('|')) {
    return null;
  }

  const cells = line
    .split('|')
    .map((cell) => cell.trim());

  if (cells[0] === '') {
    cells.shift();
  }

  if (cells[cells.length - 1] === '') {
    cells.pop();
  }

  if (cells.every((cell) => /^:?-{2,}:?$/.test(cell) || cell === '')) {
    return null;
  }

  if (cells.length < 2) {
    return null;
  }

  let subjectSemester = semester;
  let code = '';
  let name = '';
  let prerequisites = [];
  let corequisites = [];
  let trail = 'Base';

  if (cells.length >= 5 && isLikelySubjectCode(cells[1])) {
    return {
      id: normalizeSubjectId(cells[1]),
      name: cleanupSubjectName(cells[2]),
      semester: Math.max(1, Number(extractSemesterNumber(cells[0]) || semester || 1)),
      trail: 'Base',
      prerequisites: extractReferenceCodesFromText(cells[3]),
      corequisites: extractReferenceCodesFromText(cells[4]),
    };
  }

  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    const semesterFromCell = extractSemesterNumber(cell);
    if (semesterFromCell) {
      subjectSemester = semesterFromCell;
      continue;
    }

    if (!code && isLikelySubjectCode(cell)) {
      code = normalizeSubjectId(cell);
      name = cleanupSubjectName(cells[index + 1] || '');
      continue;
    }

    const normalizedCell = normalizeLooseText(cell);

    if (normalizedCell.includes('pre') || normalizedCell.includes('depend')) {
      prerequisites = extractReferenceCodesFromText(cell);
      continue;
    }

    if (normalizedCell.includes('co') || normalizedCell.includes('corre')) {
      corequisites = extractReferenceCodesFromText(cell);
      continue;
    }

    if (normalizedCell.includes('trilha') || normalizedCell.includes('eixo') || normalizedCell.includes('nucleo')) {
      trail = cell;
    }
  }

  if (!code || !name) {
    return null;
  }

  return {
    id: code,
    name,
    semester: Math.max(1, Number(subjectSemester || 1)),
    trail: cleanupSubjectName(trail) || 'Base',
    prerequisites,
    corequisites,
  };
}

function extractSubjectFromPlainLine(line, semester) {
  const cleaned = String(line || '')
    .replace(/^[-*•]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const match = cleaned.match(/^([A-Z]{2,}[-.]?\d{2,}[A-Z0-9-]*|\d{5,}[A-Z0-9-]*)\s+(.+)$/);

  if (!match) {
    return null;
  }

  const code = normalizeSubjectId(match[1]);
  const remainder = match[2];
  const prerequisites = extractReferenceCodesFromText(remainder.match(/\b(?:pre[- ]?requisitos?|pre[- ]?requisito|depende de)\b(.*)$/i)?.[1] || '');
  const corequisites = extractReferenceCodesFromText(remainder.match(/\b(?:co[- ]?requisitos?|co[- ]?requisito|correquisitos?|correquisito)\b(.*)$/i)?.[1] || '');
  const trailMatch = remainder.match(/\b(?:trilha|eixo|nucleo)\s*[:\-]?\s*([A-Za-zÀ-ÿ ]+)/i);
  const name = cleanupSubjectName(remainder);

  if (!name) {
    return null;
  }

  return {
    id: code,
    name,
    semester: Math.max(1, Number(semester || 1)),
    trail: cleanupSubjectName(trailMatch?.[1] || 'Base') || 'Base',
    prerequisites,
    corequisites,
  };
}

function tryParseHeuristicCurriculum(sourceText, basePayload = {}, { fileName = '' } = {}) {
  const lines = String(sourceText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  let currentSemester = 1;
  const subjects = [];

  for (const line of lines) {
    const subject = extractSubjectFromTableLine(line, currentSemester)
      || extractSubjectFromPlainLine(line, currentSemester);

    if (subject) {
      currentSemester = subject.semester || currentSemester;
      subjects.push(subject);
      continue;
    }

    const semester = extractSemesterNumber(line);
    if (semester) {
      currentSemester = semester;
    }
  }

  const uniqueSubjects = [];
  const seenIds = new Set();

  for (const subject of subjects) {
    if (seenIds.has(subject.id)) {
      continue;
    }

    seenIds.add(subject.id);
    uniqueSubjects.push(subject);
  }

  if (uniqueSubjects.length === 0) {
    return null;
  }

  return {
    ...basePayload,
    code: basePayload.code || inferBaseCode(basePayload, fileName || basePayload.name || 'Grade importada'),
    name: basePayload.name || fileName || 'Grade importada',
    trailLabels: normalizeList(basePayload.trailLabels),
    subjects: uniqueSubjects,
  };
}

function sanitizeSubject(subject, index) {
  return {
    id: normalizeSubjectId(subject.id, `SUBJ${index + 1}`),
    name: String(subject.name || `Disciplina ${index + 1}`).trim(),
    semester: Math.max(1, Number(subject.semester || 1)),
    trail: String(subject.trail || 'Base').trim() || 'Base',
    prerequisites: normalizeReferenceIds(subject.prerequisites),
    corequisites: normalizeReferenceIds(subject.corequisites),
  };
}

function extractAcademicYear(...values) {
  const yearPattern = /\b(19|20)\d{2}\b/g;

  for (const value of values) {
    const matches = String(value || '').match(yearPattern);

    if (matches?.length) {
      return Number(matches[matches.length - 1]);
    }
  }

  return null;
}

function stripAcademicYear(value) {
  return String(value || '')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/[-_/()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferBaseCode(parsedCurriculum, fallbackName) {
  const explicit = String(parsedCurriculum.baseCode || parsedCurriculum.code || '')
    .trim()
    .toUpperCase()
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/[^A-Z0-9]+/g, '');

  if (explicit) {
    return explicit.slice(0, 16);
  }

  const initials = stripAcademicYear(fallbackName)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  return (initials || 'CURSO').slice(0, 16);
}

function inferCatalogName(parsedCurriculum) {
  const resolvedName = String(
    parsedCurriculum.catalogName || parsedCurriculum.name || parsedCurriculum.code || 'Grade importada',
  ).trim();

  return stripAcademicYear(resolvedName) || resolvedName;
}

function inferVersionLabel(parsedCurriculum, academicYear) {
  const explicitLabel = String(parsedCurriculum.versionLabel || '').trim();

  if (explicitLabel) {
    return explicitLabel;
  }

  if (academicYear) {
    return String(academicYear);
  }

  return 'Grade padrao';
}

function getFileExtension(fileName = '', mimeType = '') {
  const trimmedName = String(fileName || '').trim().toLowerCase();
  const extensionFromName = trimmedName.includes('.')
    ? trimmedName.split('.').pop()
    : '';

  if (extensionFromName) {
    return extensionFromName;
  }

  if (String(mimeType || '').toLowerCase().includes('pdf')) {
    return 'pdf';
  }

  if (String(mimeType || '').toLowerCase().includes('wordprocessingml.document')) {
    return 'docx';
  }

  return '';
}

function decodeFileData(fileData) {
  const raw = String(fileData || '').trim();

  if (!raw) {
    throw new Error('Envie o arquivo da grade curricular.');
  }

  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/);

  if (!dataUrlMatch) {
    throw new Error('O arquivo enviado esta em um formato invalido.');
  }

  if (!ALLOWED_IMPORT_MIME_TYPES.has(dataUrlMatch[1])) {
    throw new Error('Tipo de arquivo nao suportado para importacao de grade.');
  }

  const buffer = Buffer.from(dataUrlMatch[2], 'base64');

  if (buffer.length > MAX_IMPORT_FILE_BYTES) {
    throw new Error('O arquivo da grade excede o limite de 10 MB.');
  }

  return {
    mimeType: dataUrlMatch[1],
    buffer,
    dataUrl: raw,
  };
}

async function extractDocxText(fileData) {
  const { buffer } = decodeFileData(fileData);
  const result = await mammoth.extractRawText({ buffer });
  return String(result.value || '').trim();
}

function buildCurriculumPrompt(fileName) {
  return [
    'Converta a grade curricular enviada para um unico objeto JSON valido.',
    'A entrada e uma matriz curricular brasileira de ensino superior, possivelmente em portugues, organizada por periodo, semestre, eixo, nucleo ou trilha.',
    'Extraia o nome do curso sem o ano quando isso estiver claro.',
    'Preencha academicYear e versionLabel quando a grade indicar ano, matriz, PPC, turno, curriculo ou versao.',
    'Cada disciplina deve virar um item em subjects.',
    'Para cada disciplina, extraia obrigatoriamente: id, name, semester, trail, prerequisites e corequisites.',
    'O campo id deve ser o codigo da disciplina exatamente como aparece no documento, normalizado sem espacos.',
    'O campo name deve conter apenas o nome da disciplina, sem codigo, sem carga horaria e sem textos auxiliares.',
    'O campo semester deve ser o periodo ou semestre em que a disciplina aparece. Se a grade estiver agrupada por bloco, use o numero do bloco correspondente.',
    'O campo trail deve representar a trilha, eixo ou categoria. Se nao houver trilha explicita, use Base.',
    'Identifique pre-requisitos e correquisitos apenas quando estiverem explicitamente informados no texto, em colunas ou observacoes.',
    'Considere como pistas comuns os rotulos: pre-requisito, pre requisito, prerequisito, requisito, depende de, correquisito, co requisito e corequisito.',
    'Use apenas codigos de disciplinas nas listas de prerequisites e corequisites.',
    'Se o documento mencionar o nome da disciplina dependente sem codigo, tente mapear para o codigo correto a partir da propria grade.',
    'Nao invente dependencias ausentes.',
    'Ignore cabecalhos, rodapes, totais, carga horaria, creditos, legendas e textos institucionais que nao sejam disciplinas.',
    'Se uma linha estiver quebrada, recomponha a disciplina juntando codigo, nome e dependencias antes de gerar o JSON.',
    'Se nao houver certeza de uma dependencia, deixe a lista vazia em vez de chutar.',
    'Retorne apenas JSON puro, sem markdown, comentarios ou texto adicional.',
    `Arquivo de origem: ${fileName || 'grade'}.`,
    `Siga este JSON Schema: ${JSON.stringify(curriculumSchema)}`,
  ].join(' ');
}

function stripMarkdownCodeFence(value) {
  const trimmed = String(value || '').trim();

  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractMistralMessageText(payload) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];

  for (const choice of choices) {
    const content = choice?.message?.content;

    if (typeof content === 'string' && content.trim()) {
      return stripMarkdownCodeFence(content);
    }

    if (Array.isArray(content)) {
      const joined = content
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }

          if (typeof item?.text === 'string') {
            return item.text;
          }

          if (typeof item?.content === 'string') {
            return item.content;
          }

          return '';
        })
        .join('')
        .trim();

      if (joined) {
        return stripMarkdownCodeFence(joined);
      }
    }
  }

  return '';
}

function extractErrorMessage(status, payload, fallbackText) {
  const candidates = [
    payload?.error?.message,
    payload?.message,
    payload?.detail,
    payload?.error,
    fallbackText,
  ];

  const resolved = candidates.find((value) => typeof value === 'string' && value.trim());

  return resolved || `A Mistral API retornou erro ${status}.`;
}

async function mistralJsonRequest(pathname, apiKey, payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(`https://api.mistral.ai${pathname}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let parsed = null;

    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      throw new Error(extractErrorMessage(response.status, parsed, rawText));
    }

    return parsed || {};
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('A requisicao para a Mistral expirou.');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildMistralClient(mistralApiKey) {
  return {
    chatComplete(payload) {
      return mistralJsonRequest('/v1/chat/completions', mistralApiKey, payload);
    },
    ocrProcess(payload) {
      return mistralJsonRequest('/v1/ocr', mistralApiKey, payload);
    },
  };
}

async function extractPdfTextWithMistral({
  fileData = '',
  fileName = '',
  mistralApiKey = '',
  mistralClient = null,
  mistralOcrModel = DEFAULT_MISTRAL_OCR_MODEL,
}) {
  const client = mistralClient || buildMistralClient(mistralApiKey);
  const payload = await client.ocrProcess({
    model: mistralOcrModel || DEFAULT_MISTRAL_OCR_MODEL,
    document: {
      type: 'document_url',
      document_url: fileData,
    },
    table_format: 'markdown',
  });

  const documentAnnotation = String(payload.document_annotation || '').trim();

  if (documentAnnotation) {
    return documentAnnotation;
  }

  const pages = Array.isArray(payload.pages) ? payload.pages : [];
  const markdown = pages
    .map((page) => String(page?.markdown || '').trim())
    .filter(Boolean)
    .join('\n\n');

  if (!markdown) {
    throw new Error('A Mistral API nao conseguiu extrair texto do PDF.');
  }

  return markdown;
}

async function parseWithMistral({
  fileName = '',
  mistralApiKey = '',
  mistralClient = null,
  mistralModel = DEFAULT_MISTRAL_MODEL,
  sourceText = '',
}) {
  const client = mistralClient || buildMistralClient(mistralApiKey);
  const payload = await client.chatComplete({
    model: mistralModel || DEFAULT_MISTRAL_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: buildCurriculumPrompt(fileName),
      },
      {
        role: 'user',
        content: String(sourceText || '').trim(),
      },
    ],
  });

  const structuredText = extractMistralMessageText(payload);

  if (!structuredText) {
    throw new Error('A Mistral API nao retornou uma grade estruturada.');
  }

  return JSON.parse(structuredText);
}

function normalizeCurriculum(parsedCurriculum, { fileName = '', sourceText = '' } = {}) {
  const rawSubjects = Array.isArray(parsedCurriculum.subjects)
    ? parsedCurriculum.subjects.map((subject, index) => sanitizeSubject(subject, index))
    : [];

  if (rawSubjects.length === 0) {
    throw new Error('Nenhuma disciplina valida foi encontrada na grade enviada.');
  }

  const subjectIds = new Set(rawSubjects.map((subject) => subject.id));
  const subjects = rawSubjects.map((subject) => ({
    ...subject,
    prerequisites: uniqueList(subject.prerequisites.filter((item) => subjectIds.has(item) && item !== subject.id)),
    corequisites: uniqueList(subject.corequisites.filter((item) => subjectIds.has(item) && item !== subject.id)),
  }));

  const catalogName = inferCatalogName(parsedCurriculum);
  const academicYear = extractAcademicYear(
    parsedCurriculum.academicYear,
    parsedCurriculum.versionLabel,
    parsedCurriculum.name,
    parsedCurriculum.catalogName,
    fileName,
    sourceText.slice(0, 4000),
  );
  const versionLabel = inferVersionLabel(parsedCurriculum, academicYear);
  const baseCode = inferBaseCode(parsedCurriculum, catalogName);
  const catalogKey = slugify(parsedCurriculum.catalogKey || baseCode || catalogName) || crypto.randomUUID();
  const idSeed = parsedCurriculum.id
    || (academicYear ? `${catalogKey}-${academicYear}` : `${catalogKey}-${versionLabel}`);
  const id = slugify(idSeed) || crypto.randomUUID();
  const uniqueTrails = uniqueList(subjects.map((subject) => subject.trail).filter((trail) => trail !== 'Base'));

  return {
    id,
    code: String(parsedCurriculum.code || baseCode || 'CURSO').trim().toUpperCase().slice(0, 16),
    baseCode,
    name: catalogName,
    catalogName,
    catalogKey,
    academicYear,
    versionLabel,
    trailLabels: normalizeList(parsedCurriculum.trailLabels).filter((trail) => trail !== 'Base').length > 0
      ? normalizeList(parsedCurriculum.trailLabels).filter((trail) => trail !== 'Base')
      : uniqueTrails,
    subjects,
  };
}

function tryParseJson(sourceText) {
  try {
    return JSON.parse(sourceText);
  } catch {
    return null;
  }
}

function tryParseDelimited(sourceText) {
  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return null;
  }

  const delimiter = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map((item) => item.trim().toLowerCase());
  const requiredHeaders = ['id', 'name', 'semester', 'trail'];

  if (!requiredHeaders.every((header) => headers.includes(header))) {
    return null;
  }

  const rows = lines.slice(1).map((line) => {
    const values = line.split(delimiter).map((item) => item.trim());
    return headers.reduce((accumulator, header, index) => {
      accumulator[header] = values[index] || '';
      return accumulator;
    }, {});
  });

  return {
    code: 'IMPORTADA',
    name: 'Grade importada',
    academicYear: extractAcademicYear(lines[0]),
    trailLabels: uniqueList(rows.map((row) => row.trail).filter((trail) => trail && trail !== 'Base')),
    subjects: rows.map((row) => ({
      id: row.id,
      name: row.name,
      semester: Number(row.semester),
      trail: row.trail || 'Base',
      prerequisites: normalizeList(row.prerequisites),
      corequisites: normalizeList(row.corequisites),
    })),
  };
}

async function parseCurriculumSource(
  {
    fileData = '',
    fileName = '',
    mimeType = '',
    mistralApiKey = '',
    mistralModel = DEFAULT_MISTRAL_MODEL,
    mistralOcrModel = DEFAULT_MISTRAL_OCR_MODEL,
    sourceText = '',
  },
  {
    docxTextExtractor = extractDocxText,
    mistralClient = null,
    pdfTextExtractor = extractPdfTextWithMistral,
  } = {},
) {
  const extension = getFileExtension(fileName, mimeType);
  let normalizedSource = String(sourceText || '').trim();

  if (!normalizedSource && DOCX_EXTENSIONS.has(extension)) {
    normalizedSource = await docxTextExtractor(fileData);
  }

  if (!normalizedSource && !fileData) {
    throw new Error('Envie o conteudo ou o arquivo da grade curricular.');
  }

  if (normalizedSource && (!extension || TEXT_EXTENSIONS.has(extension) || DOCX_EXTENSIONS.has(extension))) {
    const jsonPayload = tryParseJson(normalizedSource);
    if (jsonPayload) {
      return normalizeCurriculum(jsonPayload, { fileName, sourceText: normalizedSource });
    }

    const delimitedPayload = tryParseDelimited(normalizedSource);
    if (delimitedPayload) {
      return normalizeCurriculum(delimitedPayload, { fileName, sourceText: normalizedSource });
    }
  }

  if (!mistralApiKey) {
    throw new Error('Configure MISTRAL_API_KEY no backend para importar PDF, DOCX ou grades nao estruturadas.');
  }

  let aiSourceText = normalizedSource;

  if (fileData) {
    const decodedFile = decodeFileData(fileData);

    if (PDF_EXTENSIONS.has(extension) && !decodedFile.mimeType.includes('pdf')) {
      throw new Error('O arquivo enviado nao parece ser um PDF valido.');
    }

    if (!aiSourceText && PDF_EXTENSIONS.has(extension)) {
      aiSourceText = await pdfTextExtractor({
        fileData: decodedFile.dataUrl,
        fileName,
        mistralApiKey,
        mistralClient,
        mistralOcrModel,
      });
    }
  }

  const aiPayload = await parseWithMistral({
    fileName,
    mistralApiKey,
    mistralClient,
    mistralModel,
    sourceText: aiSourceText,
  });

  try {
    return normalizeCurriculum(aiPayload, {
      fileName,
      sourceText: aiSourceText,
    });
  } catch (error) {
    if (error?.message !== 'Nenhuma disciplina valida foi encontrada na grade enviada.') {
      throw error;
    }

    const heuristicPayload = tryParseHeuristicCurriculum(aiSourceText, aiPayload, { fileName });

    if (!heuristicPayload) {
      throw error;
    }

    return normalizeCurriculum(heuristicPayload, {
      fileName,
      sourceText: aiSourceText,
    });
  }
}

module.exports = {
  normalizeCurriculum,
  parseCurriculumSource,
};
