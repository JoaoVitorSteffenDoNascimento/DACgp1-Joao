import { describe, expect, it } from 'vitest'
import {
  formatRegistration,
  getPasswordSecurityMessage,
  isValidEmail,
  normalizeEmail,
  normalizeRegistration,
  validateAuthForm,
} from './authValidation'

describe('authValidation', () => {
  it('normaliza matricula e e-mail de forma consistente', () => {
    expect(normalizeRegistration('2026-0000019')).toBe('2026000001')
    expect(formatRegistration('2026000001')).toBe('2026 000001')
    expect(normalizeEmail('  USER+test@Example.edu.br  ')).toBe('user+test@example.edu.br')
  })

  it('aceita e-mails com formato valido e rejeita formatos perigosos', () => {
    expect(isValidEmail('aluna.segura+lab@universidade.edu.br')).toBe(true)
    expect(isValidEmail('aluna@localhost')).toBe(false)
    expect(isValidEmail('aluna@@universidade.edu.br')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it('exige senha forte com letras, numero e caractere especial', () => {
    expect(getPasswordSecurityMessage('abc')).toBe('A senha deve ter pelo menos 8 caracteres.')
    expect(getPasswordSecurityMessage('Senhaforte1')).toBe('A senha deve incluir pelo menos um caractere especial.')
    expect(getPasswordSecurityMessage('senhaforte1!')).toBe('A senha deve incluir pelo menos uma letra maiuscula.')
    expect(getPasswordSecurityMessage('SENHAFORTE1!')).toBe('A senha deve incluir pelo menos uma letra minuscula.')
    expect(getPasswordSecurityMessage('Senha Forte1!')).toBe('A senha nao pode conter espacos.')
    expect(getPasswordSecurityMessage('Senhaforte!')).toBe('A senha deve incluir pelo menos um numero.')
    expect(getPasswordSecurityMessage('Senhaforte1!')).toBe('')
  })

  it('valida cadastro com politica forte de credenciais', () => {
    expect(validateAuthForm('register', {
      name: 'Lu',
      registration: '2026 000001',
      email: 'aluna@universidade.edu.br',
      password: 'Senhaforte1!',
    })).toBe('Informe um nome valido.')

    expect(validateAuthForm('register', {
      name: 'Lucas Oliveira',
      registration: '2026 00001',
      email: 'aluna@universidade.edu.br',
      password: 'Senhaforte1!',
    })).toBe('A matricula deve ter 10 digitos.')

    expect(validateAuthForm('register', {
      name: 'Lucas Oliveira',
      registration: '2026 000001',
      email: 'email-invalido',
      password: 'Senhaforte1!',
    })).toBe('Informe um e-mail valido.')

    expect(validateAuthForm('register', {
      name: 'Lucas Oliveira',
      registration: '2026 000001',
      email: 'aluna@universidade.edu.br',
      password: 'Senhaforte1!',
    })).toBe('')
  })
})
