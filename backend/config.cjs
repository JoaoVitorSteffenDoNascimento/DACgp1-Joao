const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(__dirname, '..', '.env'),
  quiet: process.env.NODE_ENV === 'test',
});

function parseAllowedOrigins(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}


function parsePositiveInt(value, fallbackValue) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return parsed;
}

function parseBoolean(value, fallbackValue = false) {
  if (value === undefined) {
    return fallbackValue;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

const appEnv = process.env.APP_ENV || process.env.NODE_ENV || 'development';

module.exports = {
  appEnv,
  isProduction: appEnv === 'production',
  port: Number(process.env.PORT || 3001),
  storageDriver: process.env.STORAGE_DRIVER || 'file',
  usersFile: path.resolve(
    __dirname,
    '..',
    process.env.USERS_FILE || 'backend/data/users.json',
  ),
  importedCurriculumsFile: path.resolve(
    __dirname,
    '..',
    process.env.IMPORTED_CURRICULUMS_FILE || 'backend/data/imported-curriculums.json',
  ),
  databaseUrl: process.env.DATABASE_URL || '',
  allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
  mistralApiKey: process.env.MISTRAL_API_KEY || process.env.OPENAI_API_KEY || '',
  mistralModel: process.env.MISTRAL_MODEL || process.env.OPENAI_MODEL || 'mistral-small-latest',
  mistralOcrModel: process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest',
  trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
  authMaxFailedAttempts: parsePositiveInt(process.env.AUTH_MAX_FAILED_ATTEMPTS, 5),
  authAttemptWindowMs: parsePositiveInt(process.env.AUTH_ATTEMPT_WINDOW_MS, 10 * 60 * 1000),
  authLockoutMs: parsePositiveInt(process.env.AUTH_LOCKOUT_MS, 15 * 60 * 1000),
  maxProfileAvatarDataUriLength: parsePositiveInt(process.env.MAX_PROFILE_AVATAR_DATA_URI_LENGTH, 2 * 1024 * 1024),
  maxImportTextLength: parsePositiveInt(process.env.MAX_IMPORT_TEXT_LENGTH, 4 * 1024 * 1024),
  maxImportFileDataLength: parsePositiveInt(process.env.MAX_IMPORT_FILE_DATA_LENGTH, 8 * 1024 * 1024),
};
