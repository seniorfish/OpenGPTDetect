// ---------- Backend API wrapper ----------
// Every inbound payload is validated through the schemas in schemas.ts; nothing
// arrives with an unchecked `as T`.
import { PplResponseSchema, HealthResponseSchema } from './schemas.ts'
import type { HealthResponse, PplResponse } from './schemas.ts'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function createApi(getBaseUrl: () => string) {
  const url = (path: string): string => `${getBaseUrl().replace(/\/+$/, '')}${path}`

  async function postJson<T>(path: string, body: unknown, parse: (data: unknown) => T, timeoutMs = 120000): Promise<T> {
    const ctrl = new AbortController()
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const resp = await fetch(url(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal
      })
      const data: unknown = await resp.json().catch(() => null)
      if (!resp.ok) {
        const detail = data && typeof data === 'object' && 'detail' in data
          ? (data as { detail: unknown }).detail
          : `HTTP ${resp.status}`
        const msg = typeof detail === 'string' ? detail : JSON.stringify(detail)
        throw new ApiError(msg, resp.status)
      }
      return parse(data)
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    /** GET /health; returns null when offline or when the payload is malformed. */
    async health(): Promise<HealthResponse | null> {
      try {
        const resp = await fetch(url('/health'), { signal: AbortSignal.timeout(4000) })
        if (!resp.ok) return null
        return HealthResponseSchema.parse(await resp.json())
      } catch {
        return null
      }
    },
    /** POST /ppl one-step: text -> PPL. */
    ppl: (text: string): Promise<PplResponse> =>
      postJson<PplResponse>('/ppl', { text }, (data) => PplResponseSchema.parse(data))
  }
}