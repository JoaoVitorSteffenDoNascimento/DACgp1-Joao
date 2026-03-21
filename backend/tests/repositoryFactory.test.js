// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const FileUserRepository = require('../repositories/fileUserRepository.cjs')
const PostgresUserRepository = require('../repositories/postgresUserRepository.cjs')
const configModulePath = require.resolve('../config.cjs')
const repositoryIndexPath = require.resolve('../repositories/index.cjs')

function loadCreateUserRepository() {
  delete require.cache[configModulePath]
  delete require.cache[repositoryIndexPath]

  return require('../repositories/index.cjs').createUserRepository
}

const originalEnv = {
  STORAGE_DRIVER: process.env.STORAGE_DRIVER,
  USERS_FILE: process.env.USERS_FILE,
  DATABASE_URL: process.env.DATABASE_URL,
}

afterEach(() => {
  if (originalEnv.STORAGE_DRIVER === undefined) {
    delete process.env.STORAGE_DRIVER
  } else {
    process.env.STORAGE_DRIVER = originalEnv.STORAGE_DRIVER
  }

  if (originalEnv.USERS_FILE === undefined) {
    delete process.env.USERS_FILE
  } else {
    process.env.USERS_FILE = originalEnv.USERS_FILE
  }

  if (originalEnv.DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL
  } else {
    process.env.DATABASE_URL = originalEnv.DATABASE_URL
  }
})

describe('createUserRepository', () => {
  it('retorna o repositorio em arquivo quando STORAGE_DRIVER=file', () => {
    process.env.STORAGE_DRIVER = 'file'
    process.env.USERS_FILE = 'backend/data/test-users.json'

    const createUserRepository = loadCreateUserRepository()
    const repository = createUserRepository()

    expect(repository).toBeInstanceOf(FileUserRepository)
    expect(repository.usersFile).toBe(path.resolve('backend/data/test-users.json'))
  })

  it('retorna o repositorio postgres quando STORAGE_DRIVER=postgres', () => {
    process.env.STORAGE_DRIVER = 'postgres'
    process.env.DATABASE_URL = 'postgres://coursemapper:test@localhost:5432/coursemapper'

    const createUserRepository = loadCreateUserRepository()
    const repository = createUserRepository()

    expect(repository).toBeInstanceOf(PostgresUserRepository)
    expect(repository.databaseUrl).toBe('postgres://coursemapper:test@localhost:5432/coursemapper')
  })
})
