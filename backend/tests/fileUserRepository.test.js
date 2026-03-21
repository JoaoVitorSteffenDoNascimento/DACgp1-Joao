// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const FileUserRepository = require('../repositories/fileUserRepository.cjs')

describe('FileUserRepository', () => {
  let repository
  let tempDir
  let usersFile

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'coursemapp-repo-'))
    usersFile = path.join(tempDir, 'data', 'users.json')
    repository = new FileUserRepository(usersFile)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('cria o arquivo de usuarios quando inicializado', async () => {
    await repository.init()

    const storedUsers = JSON.parse(await readFile(usersFile, 'utf8'))

    expect(storedUsers).toEqual([])
  })

  it('cria, busca e atualiza usuarios persistindo em disco', async () => {
    const user = {
      id: 'user-1',
      registration: '2026000001',
      email: 'lucas@example.com',
      name: 'Lucas',
      sessionToken: '',
    }

    await repository.create(user)

    expect(await repository.findByRegistration(user.registration)).toEqual(user)
    expect(await repository.findByEmail(user.email)).toEqual(user)

    const updatedById = await repository.updateById(user.id, {
      ...user,
      sessionToken: 'token-123',
    })

    expect(updatedById.sessionToken).toBe('token-123')
    expect(await repository.findByToken('token-123')).toEqual(updatedById)

    const updatedByToken = await repository.updateByToken('token-123', (existingUser) => ({
      ...existingUser,
      name: 'Lucas Atualizado',
    }))

    expect(updatedByToken.name).toBe('Lucas Atualizado')

    const persistedUsers = JSON.parse(await readFile(usersFile, 'utf8'))
    expect(persistedUsers).toEqual([updatedByToken])
  })

  it('retorna null quando nao encontra um usuario para atualizar', async () => {
    expect(await repository.updateById('missing-id', { name: 'Nao existe' })).toBeNull()
    expect(await repository.updateByToken('missing-token', { name: 'Nao existe' })).toBeNull()
  })
})
