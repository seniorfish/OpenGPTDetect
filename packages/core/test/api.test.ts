import { describe, it, expect } from 'vitest'
import { createApi, AppError, type Transport } from '../src/api.ts'

const HEALTH_OK = { status: 'ok', model: 'm', n_ctx: 2048, max_char_count: 2200, n_vocab: 10, nll_backend: 'numpy' }
const PPL_OK = {
  average_ppl: 3,
  average_nll: 1.1,
  token_count: 2,
  char_count: 3,
  token_details: [
    { token_index: 0, token_id: 1, token_text: 'a', nll: null, ppl: null, char_start: 0, char_end: 1 },
    { token_index: 1, token_id: 2, token_text: 'b', nll: 1.1, ppl: 3, char_start: 1, char_end: 2 }
  ]
}

function apiWith(transport: Transport) {
  return createApi(transport, () => 'http://127.0.0.1:8000/')
}

const ok = (data: unknown): Transport => async () => ({ ok: true, status: 200, data })
const fail = (status: number, error = `HTTP ${status}`): Transport => async () => ({
  ok: false,
  status,
  data: null,
  error
})

describe('createApi (transport-agnostic)', () => {
  it('ppl success parses the PplResponse', async () => {
    const api = apiWith(ok(PPL_OK))
    const res = await api.ppl('ab')
    expect(res.average_ppl).toBe(3)
  })

  it('ppl 500 maps to oom, other statuses to http, timeouts to timeout', async () => {
    await expect(apiWith(fail(500)).ppl('x')).rejects.toMatchObject({ code: 'oom', status: 500 })
    await expect(apiWith(fail(404)).ppl('x')).rejects.toMatchObject({ code: 'http', status: 404 })
    await expect(
      apiWith(async () => ({ ok: false, status: 0, data: null, error: 'timeout' })).ppl('x')
    ).rejects.toMatchObject({ code: 'timeout' })
  })

  it('ppl payload that fails Zod validation -> invalid-response', async () => {
    const bad = ok({ average_ppl: 'NaN' })
    await expect(apiWith(bad).ppl('x')).rejects.toMatchObject({ code: 'invalid-response' })
  })

  it('health returns null on failure modes, data on success', async () => {
    expect(await apiWith(fail(404)).health()).toBeNull()
    expect(await apiWith(ok({ garbage: true })).health()).toBeNull()
    expect(await apiWith(ok(HEALTH_OK)).health()).toMatchObject({ model: 'm' })
  })

  it('AppError exposes code and status', () => {
    const e = new AppError('http', 'boom', 500)
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe('http')
    expect(e.status).toBe(500)
  })
})
