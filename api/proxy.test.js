// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_RENDER_API_BASE_URL,
  getProxyHeaders,
  getRequestBody,
  getTargetUrl,
} from './[...path].js'

describe('Vercel API proxy', () => {
  it('usa o backend Render padrao quando RENDER_API_BASE_URL nao esta configurada', () => {
    vi.stubEnv('RENDER_API_BASE_URL', '')

    const targetUrl = getTargetUrl({
      query: {
        path: ['health'],
        check: '1',
      },
    })

    expect(targetUrl.toString()).toBe(`${DEFAULT_RENDER_API_BASE_URL}/health?check=1`)
  })

  it('nao encaminha Origin para evitar bloqueio de CORS no backend remoto', () => {
    const headers = getProxyHeaders({
      headers: {
        'accept-encoding': 'gzip, br',
        origin: 'https://dacgp1-joao.vercel.app',
        authorization: 'Bearer token',
        host: 'dacgp1-joao.vercel.app',
      },
    })

    expect(headers.get('origin')).toBeNull()
    expect(headers.get('accept-encoding')).toBeNull()
    expect(headers.get('host')).toBeNull()
    expect(headers.get('authorization')).toBe('Bearer token')
  })

  it('repassa o corpo bruto de requisicoes mutaveis', async () => {
    const request = {
      method: 'POST',
      body: null,
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('{"ok":')
        yield Buffer.from('true}')
      },
    }

    await expect(getRequestBody(request)).resolves.toEqual(Buffer.from('{"ok":true}'))
  })
})
