// ---------- Shared utilities ----------
import type { ColorStop } from './types.ts'

/**
 * cyrb53 string hash. Used to compare "the text sent in a request" with "the
 * current text" so stale analysis results are never applied to changed positions.
 */
export function hashText(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36)
}

/**
 * The backend returns char_start/char_end as Python string indices (Unicode code
 * points). JS/CodeMirror use UTF-16 code-unit indices (a surrogate pair such as an
 * emoji takes 2 units). This returns map[codePointIndex] = UTF-16 index.
 */
export function buildCpToUtf16Map(text: string): number[] {
  const map = [0]
  let i = 0
  for (const ch of text) {
    i += ch.length
    map.push(i)
  }
  return map
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number
): ((...args: A) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const wrapped = (...args: A) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
  wrapped.cancel = () => clearTimeout(timer)
  return wrapped
}

// ---------- Color ----------

/** '#rrggbb' -> [r, g, b] */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [128, 128, 128]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const h = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')
  return '#' + h(r) + h(g) + h(b)
}

/**
 * Interpolate along color stops. stops: [{ppl, color}] sorted by ppl ascending.
 * Below the lowest stop the endpoint color is used, above the highest the endpoint
 * color is used, and in between values are linearly interpolated.
 */
export function colorForPpl(ppl: number, stops: ColorStop[]): string {
  if (!stops.length) return '#999999'
  const sorted = [...stops].sort((a, b) => a.ppl - b.ppl)
  if (ppl <= sorted[0].ppl) return sorted[0].color
  const last = sorted[sorted.length - 1]
  if (ppl >= last.ppl) return last.color
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (ppl >= a.ppl && ppl <= b.ppl) {
      const tm = b.ppl === a.ppl ? 0 : (ppl - a.ppl) / (b.ppl - a.ppl)
      const ca = hexToRgb(a.color)
      const cb = hexToRgb(b.color)
      return rgbToHex([ca[0] + (cb[0] - ca[0]) * tm, ca[1] + (cb[1] - ca[1]) * tm, ca[2] + (cb[2] - ca[2]) * tm])
    }
  }
  return last.color
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Number formatting: keeps significant decimal places; uses scientific notation for very large/small values. */
export function fmtNum(v: number | null, digits = 2): string {
  if (v == null || Number.isNaN(v)) return '—'
  if (v >= 1e6 || (v > 0 && v < 1e-3)) return v.toExponential(2)
  return Number(v.toFixed(digits)).toString()
}

export function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }
  return s.replace(/[&<>"']/g, (c) => map[c])
}