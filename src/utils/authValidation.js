export const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d\s])[^\s]{8,}$/

export function normalizeRegistration(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10)
}

export function formatRegistration(value) {
  const digits = normalizeRegistration(value)
  return digits.length <= 4 ? digits : `${digits.slice(0, 4)} ${digits.slice(4)}`
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function isValidEmail(email) {
  return EMAIL_PATTERN.test(normalizeEmail(email))
}

export function getPasswordSecurityMessage(password) {
  const value = String(password || '')

  if (value.length < 8) {
    return 'A senha deve ter pelo menos 8 caracteres.'
  }

  if (/\s/.test(value)) {
    return 'A senha nao pode conter espacos.'
  }

  if (!/[a-z]/.test(value)) {
    return 'A senha deve incluir pelo menos uma letra minuscula.'
  }

  if (!/[A-Z]/.test(value)) {
    return 'A senha deve incluir pelo menos uma letra maiuscula.'
  }

  if (!/\d/.test(value)) {
    return 'A senha deve incluir pelo menos um numero.'
  }

  if (!/[^A-Za-z\d\s]/.test(value)) {
    return 'A senha deve incluir pelo menos um caractere especial.'
  }

  return ''
}

export function validateAuthForm(authMode, form) {
  const registration = normalizeRegistration(form.registration)

  if (authMode === 'register' && String(form.name || '').trim().length < 3) {
    return 'Informe um nome valido.'
  }

  if (registration.length !== 10) {
    return 'A matricula deve ter 10 digitos.'
  }

  if (authMode === 'register' && !isValidEmail(form.email)) {
    return 'Informe um e-mail valido.'
  }

  return getPasswordSecurityMessage(form.password)
}
