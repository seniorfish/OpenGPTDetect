// ---------- 后端 API 封装 ----------

export function createApi(getBaseUrl) {
  const url = (path) => `${getBaseUrl().replace(/\/+$/, '')}${path}`

  async function postJson(path, body, timeoutMs = 120000) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const resp = await fetch(url(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal
      })
      const data = await resp.json().catch(() => null)
      if (!resp.ok) {
        const detail = data && data.detail ? data.detail : `HTTP ${resp.status}`
        const err = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
        err.status = resp.status
        throw err
      }
      return data
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    /** GET /health，返回 null 表示离线 */
    async health() {
      try {
        const resp = await fetch(url('/health'), { signal: AbortSignal.timeout(4000) })
        if (!resp.ok) return null
        return await resp.json()
      } catch {
        return null
      }
    },
    /** POST /ppl 一步式：文本 -> PPL */
    ppl: (text) => postJson('/ppl', { text }),
    /** POST /tokenize 仅分词 */
    tokenize: (text) => postJson('/tokenize', { text })
  }
}
