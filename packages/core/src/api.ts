// ---------- Backend API wrapper (transport-agnostic) ----------
// Every inbound payload is validated through the schemas in schemas.ts; nothing
// arrives with an unchecked `as T`. The transport is injected so the same client
// works over a direct fetch (editor, single-file HTML) or a background proxy
// message (extension pages / content scripts, where page CORS applies).
import { HealthResponseSchema, PplResponseSchema } from './schemas.ts'
import type { HealthResponse, PplResponse } from './schemas.ts'
import { AppError } from './errors.ts'

export { AppError }

export interface ApiRequest {
  url: string
  method: 'POST' | 'GET'
  body?: unknown
  timeoutMs?: number
}

export interface ApiResponse {
  ok: boolean
  status: number
  data: unknown
  error?: string
}

export type Transport = (req: ApiRequest) => Promise<ApiResponse>

/** Default transport: native fetch with an AbortSignal timeout. */
export function createFetchTransport(fetchFn: typeof fetch = fetch): Transport {
  return async (req) => {
    const timeoutMs = req.timeoutMs ?? 120000
    let signal: AbortSignal | undefined
    if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
      signal = AbortSignal.timeout(timeoutMs)
    }
    try {
      const resp = await fetchFn(req.url, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body: req.body != null ? JSON.stringify(req.body) : undefined,
        signal
      })
      const data: unknown = await resp.json().catch(() => null)
      return { ok: resp.ok, status: resp.status, data, error: resp.ok ? undefined : `HTTP ${resp.status}` }
    } catch (e) {
      const errName = e instanceof DOMException ? e.name : ''
      return {
        ok: false,
        status: 0,
        data: null,
        error: errName === 'TimeoutError' ? 'timeout' : e instanceof Error ? e.message : String(e)
      }
    }
  }
}

export interface PplApi {
  /** GET /health; returns null when offline or when the payload is malformed. */
  health(): Promise<HealthResponse | null>
  /** POST /ppl one-step: text -> PPL. */
  ppl(text: string): Promise<PplResponse>
}

export function createApi(transport: Transport, getBaseUrl: () => string): PplApi {
  const url = (path: string): string => `${getBaseUrl().replace(/\/+$/, '')}${path}`

  async function post(path: string, body: unknown): Promise<unknown> {
    const r = await transport({ url: url(path), method: 'POST', body })
    if (!r.ok) {
      if (r.error === 'timeout') throw new AppError('timeout')
      // A 500 on a large chunk is the service OOM signature (callers may retry halved).
      throw new AppError(r.status === 500 ? 'oom' : 'http', r.error, r.status)
    }
    return r.data
  }

  return {
    async health(): Promise<HealthResponse | null> {
      let r: ApiResponse
      try {
        r = await transport({ url: url('/health'), method: 'GET', timeoutMs: 4000 })
      } catch {
        return null
      }
      if (!r.ok) return null
      const p = HealthResponseSchema.safeParse(r.data)
      return p.success ? p.data : null
    },
    async ppl(text: string): Promise<PplResponse> {
      let data: unknown
      try {
        data = await post('/ppl', { text })
      } catch (e) {
        throw e instanceof AppError ? e : new AppError('network', String(e))
      }
      try {
        return PplResponseSchema.parse(data)
      } catch {
        throw new AppError('invalid-response')
      }
    }
  }
}
