const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'accept-encoding',
  'content-length',
  'host',
  'keep-alive',
  'origin',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto',
  'x-vercel-id',
]);

const DEFAULT_RENDER_API_BASE_URL = 'https://dacgp1-joao.onrender.com/api';
const MAX_PROXY_BODY_BYTES = 20 * 1024 * 1024;

function getTargetUrl(req) {
  const baseUrl = process.env.RENDER_API_BASE_URL || DEFAULT_RENDER_API_BASE_URL;

  const pathSegments = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path
      ? [req.query.path]
      : [];

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const targetUrl = new URL(`${normalizedBaseUrl}/${pathSegments.join('/')}`);

  Object.entries(req.query).forEach(([key, value]) => {
    if (key === 'path') {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => targetUrl.searchParams.append(key, item));
      return;
    }

    if (typeof value === 'string') {
      targetUrl.searchParams.set(key, value);
    }
  });

  return targetUrl;
}

function getProxyHeaders(req) {
  const headers = new Headers();

  Object.entries(req.headers).forEach(([key, value]) => {
    if (!value || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
      return;
    }

    headers.set(key, value);
  });

  return headers;
}

async function readRawRequestBody(req) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > MAX_PROXY_BODY_BYTES) {
      const error = new Error('O arquivo enviado e grande demais.');
      error.statusCode = 413;
      throw error;
    }

    chunks.push(buffer);
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

async function getRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined;
  }

  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (req.body == null) {
    return readRawRequestBody(req);
  }

  return JSON.stringify(req.body);
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  try {
    const response = await fetch(getTargetUrl(req), {
      method: req.method,
      headers: getProxyHeaders(req),
      body: await getRequestBody(req),
      redirect: 'manual',
    });

    res.status(response.status);

    response.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    const body = await response.text();
    res.send(body);
  } catch (error) {
    res.status(error?.statusCode === 413 ? 413 : 502).json({
      error: error instanceof Error ? error.message : 'Falha ao conectar com o backend remoto.',
    });
  }
}

export {
  DEFAULT_RENDER_API_BASE_URL,
  getProxyHeaders,
  getRequestBody,
  getTargetUrl,
  MAX_PROXY_BODY_BYTES,
};
