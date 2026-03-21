const crypto = require('crypto');
const dns = require('dns/promises');

const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/;
const DOMAIN_CACHE_TTL_MS = 10 * 60 * 1000;
const DNS_VALIDATION_TIMEOUT_MS = 150;
const domainValidationCache = new Map();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  const [salt, originalHash] = String(storedHash || '').split(':');

  if (!salt || !originalHash) {
    return false;
  }

  const derivedKey = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');

  return crypto.timingSafeEqual(
    Buffer.from(originalHash, 'hex'),
    Buffer.from(derivedKey, 'hex'),
  );
}

function getPasswordSecurityMessage(password) {
  const value = String(password || '');

  if (value.length < 8) {
    return 'A senha deve ter pelo menos 8 caracteres.';
  }

  if (/\s/.test(value)) {
    return 'A senha nao pode conter espacos.';
  }

  if (!/[a-z]/.test(value)) {
    return 'A senha deve incluir pelo menos uma letra minuscula.';
  }

  if (!/[A-Z]/.test(value)) {
    return 'A senha deve incluir pelo menos uma letra maiuscula.';
  }

  if (!/\d/.test(value)) {
    return 'A senha deve incluir pelo menos um numero.';
  }

  if (!/[^A-Za-z\d\s]/.test(value)) {
    return 'A senha deve incluir pelo menos um caractere especial.';
  }

  return '';
}

function isValidEmail(email) {
  return EMAIL_PATTERN.test(normalizeEmail(email));
}

function getCachedDomainValidation(domain) {
  const cachedEntry = domainValidationCache.get(domain);

  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    domainValidationCache.delete(domain);
    return null;
  }

  return cachedEntry.value;
}

function setCachedDomainValidation(domain, value) {
  domainValidationCache.set(domain, {
    value,
    expiresAt: Date.now() + DOMAIN_CACHE_TTL_MS,
  });
}

function createTimeoutPromise(timeoutMs) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });
}

async function resolveDomainFast(domain) {
  const resolvers = [
    dns.resolveMx(domain).then((records) => records.length > 0).catch(() => false),
    dns.resolve4(domain).then((records) => records.length > 0).catch(() => false),
    dns.resolve6(domain).then((records) => records.length > 0).catch(() => false),
  ];

  return Promise.any(
    resolvers.map((resolver) => resolver.then((isValid) => {
      if (isValid) {
        return true;
      }

      throw new Error('No records');
    })),
  )
    .catch(() => false);
}

async function hasResolvableEmailDomain(email) {
  const normalizedEmail = normalizeEmail(email);
  const domain = normalizedEmail.split('@')[1];

  if (!domain) {
    return false;
  }

  const cachedValue = getCachedDomainValidation(domain);
  if (cachedValue !== null) {
    return cachedValue;
  }

  const result = await Promise.race([
    resolveDomainFast(domain),
    createTimeoutPromise(DNS_VALIDATION_TIMEOUT_MS),
  ]);

  // Em caso de timeout da infraestrutura DNS, nao bloqueamos o fluxo.
  // O formato do e-mail continua validado localmente e dominios responsivos entram em cache.
  if (result === null) {
    return true;
  }

  setCachedDomainValidation(domain, result);
  return result;
}

module.exports = {
  DNS_VALIDATION_TIMEOUT_MS,
  getPasswordSecurityMessage,
  hasResolvableEmailDomain,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  verifyPassword,
};
