// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const configPath = require.resolve('../config.cjs')

const originalEnv = {
  APP_ENV: process.env.APP_ENV,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  PORT: process.env.PORT,
  STORAGE_DRIVER: process.env.STORAGE_DRIVER,
  USERS_FILE: process.env.USERS_FILE,
  DATABASE_URL: process.env.DATABASE_URL,
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
  MISTRAL_MODEL: process.env.MISTRAL_MODEL,
  MISTRAL_OCR_MODEL: process.env.MISTRAL_OCR_MODEL,
  TRUST_PROXY: process.env.TRUST_PROXY,
  AUTH_MAX_FAILED_ATTEMPTS: process.env.AUTH_MAX_FAILED_ATTEMPTS,
  AUTH_ATTEMPT_WINDOW_MS: process.env.AUTH_ATTEMPT_WINDOW_MS,
  AUTH_LOCKOUT_MS: process.env.AUTH_LOCKOUT_MS,
  MAX_PROFILE_AVATAR_DATA_URI_LENGTH: process.env.MAX_PROFILE_AVATAR_DATA_URI_LENGTH,
  MAX_IMPORT_TEXT_LENGTH: process.env.MAX_IMPORT_TEXT_LENGTH,
  MAX_IMPORT_FILE_DATA_LENGTH: process.env.MAX_IMPORT_FILE_DATA_LENGTH,
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
    process.env.APP_ENV = 'production'
    process.env.ALLOWED_ORIGINS = 'https://app.example.com, https://admin.example.com'
    process.env.PORT = '4010'
    process.env.STORAGE_DRIVER = 'postgres'
    process.env.USERS_FILE = 'backend/data/custom-users.json'
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
    process.env.MISTRAL_API_KEY = 'mistral-key'
    process.env.MISTRAL_MODEL = 'mistral-small-latest'
    process.env.MISTRAL_OCR_MODEL = 'mistral-ocr-latest'
    process.env.TRUST_PROXY = 'true'
    process.env.AUTH_MAX_FAILED_ATTEMPTS = '7'
    process.env.AUTH_ATTEMPT_WINDOW_MS = '30000'
    process.env.AUTH_LOCKOUT_MS = '60000'
    process.env.MAX_PROFILE_AVATAR_DATA_URI_LENGTH = '2048'
    process.env.MAX_IMPORT_TEXT_LENGTH = '4096'
    process.env.MAX_IMPORT_FILE_DATA_LENGTH = '8192'

    const config = loadConfig()

    expect(config.appEnv).toBe('production')
    expect(config.isProduction).toBe(true)
    expect(config.allowedOrigins).toEqual(['https://app.example.com', 'https://admin.example.com'])
    expect(config.port).toBe(4010)
    expect(config.storageDriver).toBe('postgres')
    expect(config.usersFile).toBe(path.resolve(process.cwd(), 'backend/data/custom-users.json'))
    expect(config.databaseUrl).toBe('postgresql://user:pass@localhost:5432/db')
    expect(config.mistralApiKey).toBe('mistral-key')
    expect(config.mistralModel).toBe('mistral-small-latest')
    expect(config.mistralOcrModel).toBe('mistral-ocr-latest')
    expect(config.trustProxy).toBe(true)
    expect(config.authMaxFailedAttempts).toBe(7)
    expect(config.authAttemptWindowMs).toBe(30000)
    expect(config.authLockoutMs).toBe(60000)
    expect(config.maxProfileAvatarDataUriLength).toBe(2048)
    expect(config.maxImportTextLength).toBe(4096)
    expect(config.maxImportFileDataLength).toBe(8192)
  })
})
