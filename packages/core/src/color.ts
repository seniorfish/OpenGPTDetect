// ---------- ppl -> color mapping (deterministic, agreed algorithm) ----------
// The interpolation algorithm below is the canonical one: endpoint clamping +
// linear interpolation in sRGB space, rounded via rgbToHex. Both the TypeScript
// editors/extensions and the Python measure scripts (`tools/measure`) must match
// it exactly — `test-fixtures/ppl-color.golden.json` locks both sides.
import type { ColorStop } from './scale.ts'

/** '#rrggbb' -> [r, g, b]. Invalid input falls back to gray. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [128, 128, 128]
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const h = (v: number) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0')
  return '#' + h(r) + h(g) + h(b)
}

/**
 * Interpolate along color stops, sorted by ppl ascending.
 * Below the lowest stop the endpoint color is used, above the highest the endpoint
 * color is used, and in between values are linearly interpolated in sRGB.
 */
export function colorForPpl(ppl: number, stops: ColorStop[]): string {
  if (!stops.length) return '#999999'
  const sorted = [...stops].sort((a, b) => a.ppl - b.ppl)
  if (ppl <= sorted[0]!.ppl) return sorted[0]!.color
  const last = sorted[sorted.length - 1]!
  if (ppl >= last.ppl) return last.color
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!
    const b = sorted[i + 1]!
    if (ppl >= a.ppl && ppl <= b.ppl) {
      const tm = b.ppl === a.ppl ? 0 : (ppl - a.ppl) / (b.ppl - a.ppl)
      const ca = hexToRgb(a.color)
      const cb = hexToRgb(b.color)
      return rgbToHex([ca[0] + (cb[0] - ca[0]) * tm, ca[1] + (cb[1] - ca[1]) * tm, ca[2] + (cb[2] - ca[2]) * tm])
    }
  }
  return last.color
}

/** '#rrggbb' + alpha -> rgba() CSS string. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
