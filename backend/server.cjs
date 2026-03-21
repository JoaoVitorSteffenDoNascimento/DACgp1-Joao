const config = require('./config.cjs');
const { createUserRepository } = require('./repositories/index.cjs');
const { createApp } = require('./app.cjs');

const userRepository = createUserRepository();
const app = createApp({ userRepository, config });

async function startServer(port = config.port) {
  await userRepository.init();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      resolve(server);
    });

    server.on('error', reject);
  });
}

if (require.main === module) {
  startServer()
    .then(() => {
      console.log(`CourseMapper backend ativo em http://localhost:${config.port}`);
    })
    .catch((error) => {
      console.error('Falha ao iniciar o backend:', error);
      process.exit(1);
    });
}

module.exports = { app, startServer };
