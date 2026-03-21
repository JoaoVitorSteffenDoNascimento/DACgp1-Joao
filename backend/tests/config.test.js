// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const configPath = require.resolve('../config.cjs')

const originalEnv = {
  PORT: process.env.PORT,
  STORAGE_DRIVER: process.env.STORAGE_DRIVER,
  USERS_FILE: process.env.USERS_FILE,
  DATABASE_URL: process.env.DATABASE_URL,
}

function loadConfig() {
  delete require.cache[configPath]
  return require('../config.cjs')
}

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

describe('config', () => {
  it('carrega valores do ambiente', () => {
    process.env.PORT = '4010'
    process.env.STORAGE_DRIVER = 'file'
    process.env.USERS_FILE = 'backend/data/custom-users.json'
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'

    const config = loadConfig()

    expect(config.port).toBe(4010)
    expect(config.storageDriver).toBe('file')
    expect(config.usersFile).toBe(path.resolve(process.cwd(), 'backend/data/custom-users.json'))
    expect(config.databaseUrl).toBe('postgresql://user:pass@localhost:5432/db')
  })
})
