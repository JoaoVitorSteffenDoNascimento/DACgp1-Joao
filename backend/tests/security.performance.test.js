// @vitest-environment node
import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  getPasswordSecurityMessage,
  isValidEmail,
  normalizeEmail,
} = require('../security.cjs')

describe('security performance', () => {
  it('executa validacoes leves de seguranca em lote rapidamente', () => {
    const start = performance.now()

    for (let index = 0; index < 100000; index += 1) {
      normalizeEmail('  Lucas@Universidade.edu.br ')
      isValidEmail('lucas@universidade.edu.br')
      getPasswordSecurityMessage('Senhaforte1!')
    }

    const durationMs = performance.now() - start

    expect(durationMs).toBeLessThan(200)
  })
})
