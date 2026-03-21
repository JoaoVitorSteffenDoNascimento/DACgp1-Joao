const curriculums = require('./data/curriculums.cjs');
const { createUserRepository } = require('./repositories/index.cjs');
const crypto = require('crypto');
const { hashPassword } = require('./security.cjs');

const userRepository = createUserRepository();

async function run() {
  await userRepository.init();

  const registration = '2026000001';
  const email = 'lucas@coursemapp.local';
  const demoPassword = 'Demo@2026';
  const existingUser = await userRepository.findByRegistration(registration);

  if (existingUser) {
    await userRepository.updateById(existingUser.id, {
      ...existingUser,
      email,
      passwordHash: hashPassword(demoPassword),
    });
    console.log('Usuario demo atualizado com senha forte.');
    console.log('Matricula: 2026000001');
    console.log(`Senha: ${demoPassword}`);
    return;
  }

  await userRepository.create({
    id: crypto.randomUUID(),
    name: 'Lucas Demo',
    username: 'lucasdemo',
    registration,
    email,
    courseId: 'cc',
    avatarUrl: '',
    passwordHash: hashPassword(demoPassword),
    sessionToken: '',
    preferences: {
      theme: 'brand',
    },
    progress: {
      cc: ['CC101', 'CC102', 'CC103'],
      si: [],
    },
  });

  console.log('Usuario demo criado com sucesso.');
  console.log('Matricula: 2026000001');
  console.log(`Senha: ${demoPassword}`);
  console.log(`Cursos disponiveis: ${Object.keys(curriculums).join(', ')}`);
}

run().catch((error) => {
  console.error('Falha ao criar usuario demo:', error);
  process.exit(1);
});
