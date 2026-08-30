// Vitest unit suite for the framework-free logic layer (chunks/util).
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import type { ChangeSet } from '@codemirror/state'
import {
  sentenceChunks, paragraphChunks, avgNllOfTokens, visibleTokenSet, tokensInRange,
  mergeIgnoreRanges, isIgnored, mapTokensThroughChanges, mapRangesThroughChanges
} from '../src/chunks.ts'
import { colorForPpl, hashText, buildCpToUtf16Map } from '../src/util.ts'
import type { Token } from '../src/types.ts'

describe('chunking', () => {
  it('句子分块：中英文标点与换行', () => {
    const chunks = sentenceChunks('你好，世界。abc,def\nghi')
    expect(chunks).toStrictEqual([
      { start: 0, end: 3 }, // chunk for '你好，'
      { start: 3, end: 6 }, // chunk for '世界。'
      { start: 6, end: 10 }, // abc,
      { start: 10, end: 14 }, // def\n
      { start: 14, end: 17 } // ghi
    ])
  })

  it('段落分块：按换行', () => {
    expect(paragraphChunks('ab\ncd\nef')).toStrictEqual([
      { start: 0, end: 3 },
      { start: 3, end: 6 },
      { start: 6, end: 8 }
    ])
  })
})

describe('colorForPpl', () => {
  const stops = [
    { ppl: 12, color: '#22c55e' },
    { ppl: 18, color: '#eab308' },
    { ppl: 50, color: '#ef4444' },
    { ppl: 100, color: '#7f1d1d' }
  ]

  it('低于最小节点取端点色', () => expect(colorForPpl(5, stops)).toBe('#22c55e'))
  it('高于最大节点取端点色', () => expect(colorForPpl(500, stops)).toBe('#7f1d1d'))
  it('节点处精确取值', () => expect(colorForPpl(18, stops)).toBe('#eab308'))
  it('节点间渐变', () => {
    const mid = colorForPpl(15, stops) // midpoint between 12-green and 18-yellow
    expect(mid).not.toBe('#22c55e')
    expect(mid).not.toBe('#eab308')
    expect(mid).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('stats', () => {
  it('平均 NLL：跳过脏/忽略区间/null', () => {
    const tokens: Token[] = [
      { tokenIndex: 0, tokenId: 0, text: 'a', nll: 1, ppl: Math.E, start: 0, end: 1, stale: false },
      { tokenIndex: 1, tokenId: 1, text: 'b', nll: 3, ppl: 20, start: 1, end: 2, stale: false },
      { tokenIndex: 2, tokenId: 2, text: 'c', nll: 100, ppl: 1e30, start: 2, end: 3, stale: true },
      { tokenIndex: 3, tokenId: 3, text: 'd', nll: 100, ppl: 1e30, start: 3, end: 4, stale: false },
      { tokenIndex: 4, tokenId: 4, text: 'e', nll: null, ppl: null, start: 4, end: 5, stale: false }
    ]
    const merged = mergeIgnoreRanges([{ start: 3, end: 4 }]) // ignore 'd'
    const stat = avgNllOfTokens(tokens, merged)
    expect(stat?.count).toBe(2)
    expect(stat?.nll).toBe(2)
  })

  it('分层显示：n%-m% 区间', () => {
    const tokens: Token[] = Array.from({ length: 10 }, (_, i) => ({
      tokenIndex: i, tokenId: i, text: String(i), nll: 1, ppl: (i + 1) * 10,
      stale: false, start: i, end: i + 1
    }))
    expect(visibleTokenSet(tokens, 0, 100).size).toBe(10)
    expect(visibleTokenSet(tokens, 0, 10).size).toBe(1) // lowest 10%
    const top = visibleTokenSet(tokens, 90, 100)
    expect(top.size).toBe(1)
    expect([...top][0]!.ppl).toBe(100) // highest 10%
    expect(visibleTokenSet(tokens, 50, 60).size).toBe(1)
  })
})

describe('utilities', () => {
  it('hashText：稳定且区分', () => {
    expect(hashText('你好')).toBe(hashText('你好'))
    expect(hashText('你好')).not.toBe(hashText('你好！'))
  })

  it('码点→UTF-16 映射：emoji 占 2 码元', () => {
    // cp 0='a'->0, 1='😀'->1, 2='b'->3, 3=end->4
    expect(buildCpToUtf16Map('a😀b')).toStrictEqual([0, 1, 3, 4])
  })
})

// ---------- Dirty marking (requirement 6 scenarios) ----------
function changeOf(doc: string, spec: { from: number; insert?: string; to?: number }): ChangeSet {
  const state = EditorState.create({ doc })
  return state.update({ changes: spec }).changes
}

const tk = (start: number, end: number, extra: Partial<Token> = {}): Token => ({
  tokenIndex: 0, tokenId: 1, text: 'x', nll: 1, ppl: 2, stale: false, start, end, ...extra
})

describe('editor state mapping', () => {
  it('文首插入前缀：原 token 后移且保持干净', () => {
    // "你好" (token [0,2)); a prefix "小明，" is inserted at the start
    const changes = changeOf('你好', { from: 0, insert: '小明，' })
    const out = mapTokensThroughChanges([tk(0, 2)], changes)
    expect(out.length).toBe(1)
    expect([out[0]!.start, out[0]!.end]).toStrictEqual([3, 5])
    expect(out[0]!.stale).toBe(false)
  })

  it('删除 token 内一个字符：变脏', () => {
    // from "小明，你好" delete "好" (positions 4..5); token "你好" lives at [3,5)
    const changes = changeOf('小明，你好', { from: 4, to: 5 })
    const out = mapTokensThroughChanges([tk(3, 5)], changes)
    expect(out.length).toBe(1)
    expect(out[0]!.stale).toBe(true)
  })

  it('token 内部插入：变脏；边界插入：干净', () => {
    const inside = changeOf('你好', { from: 1, insert: 'x' })
    expect(mapTokensThroughChanges([tk(0, 2)], inside)[0]!.stale).toBe(true)
    const atStart = changeOf('你好', { from: 0, insert: 'x' })
    expect(mapTokensThroughChanges([tk(0, 2)], atStart)[0]!.stale).toBe(false)
    const atEnd = changeOf('你好', { from: 2, insert: 'x' })
    expect(mapTokensThroughChanges([tk(0, 2)], atEnd)[0]!.stale).toBe(false)
  })

  it('token 被完整删除：丢弃', () => {
    const changes = changeOf('你好世界', { from: 0, to: 2 })
    const out = mapTokensThroughChanges([tk(0, 2), tk(2, 4, { tokenIndex: 1 })], changes)
    expect(out.length).toBe(1)
    expect(out[0]!.tokenIndex).toBe(1)
    expect([out[0]!.start, out[0]!.end]).toStrictEqual([0, 2])
    expect(out[0]!.stale).toBe(false)
  })

  it('替换选区（粘贴覆盖）：相交 token 变脏', () => {
    const changes = changeOf('你好世界', { from: 1, to: 3, insert: 'ABC' })
    const out = mapTokensThroughChanges([tk(0, 2), tk(2, 4, { tokenIndex: 1 })], changes)
    expect(out.every((t) => t.stale)).toBe(true)
  })

  it('忽略区间随编辑映射', () => {
    const changes = changeOf('你好世界', { from: 0, insert: 'AB' })
    expect(mapRangesThroughChanges([{ start: 0, end: 2 }], changes)).toStrictEqual([{ start: 2, end: 4 }])
  })
})

describe('ignore ranges', () => {
  it('合并重叠/相邻/零宽', () => {
    expect(mergeIgnoreRanges([
      { start: 5, end: 9 }, { start: 1, end: 4 }, { start: 4, end: 6 }, { start: 3, end: 3 }
    ])).toStrictEqual([{ start: 1, end: 9 }])
  })

  it('半开区间与零宽点', () => {
    const merged = mergeIgnoreRanges([{ start: 2, end: 5 }])
    expect(isIgnored(3, 4, merged)).toBe(true) // strictly inside
    expect(isIgnored(5, 6, merged)).toBe(false) // starts exactly at the range end (half-open)
    expect(isIgnored(0, 2, merged)).toBe(false) // ends exactly at the range start
    expect(isIgnored(4, 4, merged)).toBe(true) // zero-width point inside
    expect(isIgnored(6, 6, merged)).toBe(false) // zero-width point outside
    expect(isIgnored(0, 1, [])).toBe(false) // empty ignore list
  })

  it('tokensInRange：选区相交', () => {
    const tokens = [tk(0, 2), tk(2, 4, { tokenIndex: 1 })]
    expect(tokensInRange(tokens, 1, 2).length).toBe(1)
    expect(tokensInRange(tokens, 0, 4).length).toBe(2)
    expect(tokensInRange(tokens, 2, 3).length).toBe(1)
  })
})