import { describe, it, expect, vi, beforeEach } from 'vitest'

type Listener = (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | undefined
const listeners: Listener[] = []

const mockBrowser = {
  runtime: {
    sendMessage: vi.fn(async () => ({ ok: true, data: {} })),
    onMessage: { addListener: (cb: Listener) => listeners.push(cb) }
  }
}

vi.mock('wxt/browser', () => ({ browser: mockBrowser }))

const { on, send } = await import('../src/lib/messaging.ts')

beforeEach(() => {
  listeners.length = 0
  mockBrowser.runtime.sendMessage.mockClear()
})

describe('typed messaging runtime', () => {
  it('routes matching message types to the handler', async () => {
    const handler = vi.fn(async () => ({ ok: true, data: { average_ppl: 1 } }))
    on('ppl', handler)
    expect(listeners).toHaveLength(1)
    const respond = vi.fn()
    listeners[0]!({ type: 'ppl', baseUrl: 'http://x', text: 'hi' }, {}, respond)
    await new Promise((r) => setTimeout(r, 0))
    expect(handler).toHaveBeenCalledWith({ baseUrl: 'http://x', text: 'hi' })
    expect(respond).toHaveBeenCalledWith({ ok: true, data: { average_ppl: 1 } })
  })

  it('ignores unrelated message types', async () => {
    const handler = vi.fn()
    on('health', handler)
    const ret = listeners[0]!({ type: 'ppl', baseUrl: 'x', text: 't' }, {}, vi.fn())
    expect(ret).toBeUndefined()
    expect(handler).not.toHaveBeenCalled()
  })

  it('send() wraps payload with the type discriminator', () => {
    void send('ppl', { baseUrl: 'http://y', text: 'abc' })
    expect(mockBrowser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'ppl', baseUrl: 'http://y', text: 'abc' })
  })
})
