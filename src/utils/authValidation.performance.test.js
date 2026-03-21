import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import {
  formatRegistration,
  normalizeEmail,
  normalizeRegistration,
  validateAuthForm,
} from './authValidation'

describe('authValidation performance', () => {
  it('executa validacao de cadastro em lote com baixa latencia', () => {
    const form = {
      name: 'Lucas Oliveira',
      registration: '2026000001',
      email: 'lucas@universidade.edu.br',
      password: 'Senhaforte1!',
    }

    const start = performance.now()

    for (let index = 0; index < 100000; index += 1) {
      validateAuthForm('register', form)
    }

    const durationMs = performance.now() - start

    expect(durationMs).toBeLessThan(150)
  })

  it('normaliza matricula e email rapidamente em lote', () => {
    const start = performance.now()

    for (let index = 0; index < 100000; index += 1) {
      normalizeRegistration('2026-000001')
      formatRegistration('2026000001')
      normalizeEmail('  Lucas@Universidade.edu.br ')
    }

    const durationMs = performance.now() - start

    expect(durationMs).toBeLessThan(180)
  })
})
