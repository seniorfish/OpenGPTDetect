import { describe, it, expect } from 'vitest'
import { detectLang, splitChunks, offsetTokens, computeStats } from '../src/measure.ts'
import type { TokenDetail } from '../src/schemas.ts'

describe('detectLang', () => {
  it('defaults to zh without letters', () => {
    expect(detectLang('12345', 0.5)).toBe('zh')
    expect(detectLang('   ', 0.5)).toBe('zh')
  })

  it('classifies by english letter ratio', () => {
    expect(detectLang('Hello world!', 0.5)).toBe('en')
    expect(detectLang('你abc', 0.5)).toBe('en') // 3 letters / 4 visible = 0.75 >= 0.5
    expect(detectLang('你好世界', 0.5)).toBe('zh') // 0 letters
    expect(detectLang('你abcdef', 0.5)).toBe('en')
  })
})

describe('splitChunks', () => {
  it('returns the text untouched when short', () => {
    expect(splitChunks('abc', 100, 'zh')).toEqual([{ text: 'abc', start: 0 }])
  })

  it('prefers sentence boundaries and packs up to maxChars', () => {
    const text = '第一句。第二句。第三句。'
    const chunks = splitChunks(text, 9, 'zh')
    // '第一句。' + '第二句。' = 8 chars <= 9 → packed together; '第三句。' alone.
    expect(chunks.map((c) => c.text)).toEqual(['第一句。第二句。', '第三句。'])
    expect(chunks.map((c) => c.start)).toEqual([0, 8])
  })

  it('hard-cuts a single overlong sentence and keeps slices contiguous', () => {
    const text = 'x'.repeat(30)
    const chunks = splitChunks(text, 10, 'zh')
    expect(chunks.length).toBe(3)
    expect(chunks.every((c) => c.text.length === 10)).toBe(true)
    expect(chunks[1].start).toBe(10)
  })
})

describe('offsetTokens', () => {
  const tokens: TokenDetail[] = [
    { token_index: 0, token_id: 1, token_text: 'a', nll: null, ppl: null, char_start: null, char_end: null },
    { token_index: 1, token_id: 2, token_text: 'b', nll: 1, ppl: 2.7, char_start: 0, char_end: 2 }
  ]

  it('shifts char ranges and keeps nulls', () => {
    const out = offsetTokens(tokens, 40)
    expect(out[0].char_start).toBeNull()
    expect(out[1].char_start).toBe(40)
    expect(out[1].char_end).toBe(42)
    expect(out[1].token_index).toBe(1)
  })
})

describe('computeStats', () => {
  it('averages non-null nll and derives ppl', () => {
    const t: TokenDetail[] = [
      { token_index: 0, token_id: 1, token_text: 'a', nll: null, ppl: null, char_start: 0, char_end: 1 },
      { token_index: 1, token_id: 2, token_text: 'b', nll: 2, ppl: null, char_start: 1, char_end: 2 },
      { token_index: 2, token_id: 3, token_text: 'c', nll: 4, ppl: null, char_start: 2, char_end: 3 }
    ]
    const s = computeStats(t)
    expect(s.nValid).toBe(2)
    expect(s.avgNll).toBe(3)
    expect(s.avgPpl).toBeCloseTo(Math.exp(3), 10)
  })

  it('returns nulls when nothing valid', () => {
    const t: TokenDetail[] = [
      { token_index: 0, token_id: 1, token_text: 'a', nll: null, ppl: null, char_start: 0, char_end: 1 }
    ]
    expect(computeStats(t)).toEqual({ avgNll: null, avgPpl: null, nValid: 0 })
  })
})
