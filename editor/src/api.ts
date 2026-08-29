// ---------- 后端 API 封装 ----------
import type { HealthResponse, PplResponse } from './types.ts'

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

  async function postJson<T>(path: string, body: unknown, timeoutMs = 120000): Promise<T> {
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
      return data as T
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    /** GET /health，返回 null 表示离线 */
    async health(): Promise<HealthResponse | null> {
      try {
        const resp = await fetch(url('/health'), { signal: AbortSignal.timeout(4000) })
        if (!resp.ok) return null
        return (await resp.json()) as HealthResponse
      } catch {
        return null
      }
    },
    /** POST /ppl 一步式：文本 -> PPL */
    ppl: (text: string): Promise<PplResponse> => postJson<PplResponse>('/ppl', { text }),
    /** POST /tokenize 仅分词 */
    tokenize: (text: string): Promise<unknown> => postJson<unknown>('/tokenize', { text })
  }
}