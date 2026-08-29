// ---------- 通用工具 ----------
import type { ColorStop } from './types.ts'

/** cyrb53 字符串哈希，用于比对“发出请求时的文本”与“当前文本”是否一致 */
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
 * 后端返回的 char_start/char_end 是 Python 字符串下标（Unicode 码点）。
 * JS/CodeMirror 使用 UTF-16 码元下标（emoji 等代理对占 2 个码元）。
 * 该函数返回一个数组 map，map[码点下标] = UTF-16 下标。
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

// ---------- 颜色 ----------

/** '#rrggbb' -> [r,g,b] */
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
 * 按颜色节点插值。stops: [{ppl, color}]（按 ppl 升序）。
 * 低于最小节点取最小节点颜色，高于最大节点取最大节点颜色，否则线性渐变。
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
      const t = b.ppl === a.ppl ? 0 : (ppl - a.ppl) / (b.ppl - a.ppl)
      const ca = hexToRgb(a.color)
      const cb = hexToRgb(b.color)
      return rgbToHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t])
    }
  }
  return last.color
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** 数值显示：保留有效小数，过大/过小用科学计数 */
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