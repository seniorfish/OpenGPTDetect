import { describe, it, expect } from 'vitest'
import { smoothTokens } from '../src/smooth.ts'

describe('smoothTokens token window (centered)', () => {
  const tokens = [{ ppl: 1 }, { ppl: null }, { ppl: 9 }, { ppl: 16 }, { ppl: null }]

  it('window 1 = raw (null preserved)', () => {
    expect(smoothTokens(tokens, 'token', 1)).toEqual([1, null, 9, 16, null])
  })

  it('window 3 averages non-null neighbors (nulls skipped)', () => {
    expect(smoothTokens(tokens, 'token', 3)).toEqual([1, 5, 12.5, 12.5, 16])
  })
})

describe('smoothTokens sentence mode', () => {
  it('groups by CJK/ASCII sentence boundaries', () => {
    const t = [
      { ppl: 2, text: '好' },
      { ppl: 4, text: '。' },
      { ppl: 6, text: '好' },
      { ppl: 8, text: '好' }
    ]
    expect(smoothTokens(t, 'sentence', 1)).toEqual([3, 3, 7, 7])
  })

  it('falls back to a single group without boundaries', () => {
    const t = [{ ppl: 2 }, { ppl: 4 }]
    expect(smoothTokens(t, 'sentence', 1)).toEqual([3, 3])
  })

  it('treats trailing text after the last boundary as its own group', () => {
    const t = [{ ppl: 1, text: 'A' }, { ppl: 3, text: '!' }, { ppl: 5, text: 'B' }]
    expect(smoothTokens(t, 'sentence', 1)).toEqual([2, 2, 5])
  })
})
