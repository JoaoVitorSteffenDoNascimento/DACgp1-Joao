import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['backend/tests/**/*.test.js', 'src/**/*.test.{js,jsx}'],
    setupFiles: ['./vitest.setup.js'],
    restoreMocks: true,
  },
})
