import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { colorForPpl, hexToRgb, rgbToHex, rgba } from '../src/color.ts'
import type { ColorStop } from '../src/scale.ts'

// Golden fixture: shared with tools/measure (Python) — read by BOTH sides.
const fixturePath = fileURLToPath(new URL('../../../test-fixtures/ppl-color.golden.json', import.meta.url))
const GOLDEN = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  slots: Record<string, { stops: ColorStop[] }>
  cases: { name: string; slot: string; ppl: number; expected: string }[]
}

describe('colorForPpl golden fixture (cross-language contract)', () => {
  for (const c of GOLDEN.cases) {
    it(c.name, () => {
      const stops = GOLDEN.slots[c.slot].stops
      expect(colorForPpl(c.ppl, stops)).toBe(c.expected)
    })
  }
})

describe('colorForPpl edge behavior', () => {
  it('returns gray on empty stops', () => {
    expect(colorForPpl(10, [])).toBe('#999999')
  })

  it('is independent of input stop order', () => {
    const stops: ColorStop[] = [
      { ppl: 50, color: '#ef4444' },
      { ppl: 12, color: '#22c55e' }
    ]
    const sorted: ColorStop[] = [
      { ppl: 12, color: '#22c55e' },
      { ppl: 50, color: '#ef4444' }
    ]
    expect(colorForPpl(30, stops)).toBe(colorForPpl(30, sorted))
  })

  it('handles duplicate ppl anchors (t = 0, first wins)', () => {
    const stops: ColorStop[] = [
      { ppl: 10, color: '#111111' },
      { ppl: 10, color: '#222222' }
    ]
    expect(colorForPpl(10, stops)).toBe('#111111')
  })
})

describe('hex helpers', () => {
  it('parses #rrggbb and rejects garbage', () => {
    expect(hexToRgb('#22c55e')).toEqual([34, 197, 94])
    expect(hexToRgb('22c55e')).toEqual([34, 197, 94])
    expect(hexToRgb('nope')).toEqual([128, 128, 128])
  })

  it('round-trips rgbToHex with clamping', () => {
    expect(rgbToHex([34, 197, 94])).toBe('#22c55e')
    expect(rgbToHex([300, -5, 0.4])).toBe('#ff0000')
  })

  it('builds rgba() strings', () => {
    expect(rgba('#22c55e', 0.35)).toBe('rgba(34, 197, 94, 0.35)')
  })
})
