// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const renderSpy = vi.fn()
const createRootSpy = vi.fn(() => ({ render: renderSpy }))

vi.mock('react-dom/client', () => ({
  createRoot: createRootSpy,
}))

vi.mock('./App.jsx', () => ({
  default: function MockApp() {
    return null
  },
}))

describe('main bootstrap', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
    renderSpy.mockClear()
    createRootSpy.mockClear()
    vi.resetModules()
  })

  it('monta a aplicacao no elemento root', async () => {
    await import('./main.jsx')

    expect(createRootSpy).toHaveBeenCalledWith(document.getElementById('root'))
    expect(renderSpy).toHaveBeenCalledTimes(1)
  })
})
