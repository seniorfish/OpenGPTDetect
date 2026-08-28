// 纯逻辑无头测试：node test/logic.test.mjs
import assert from 'node:assert'
import { EditorState } from '@codemirror/state'
import { sentenceChunks, paragraphChunks, avgNllOfTokens, visibleTokenSet, tokensInRange } from '../src/chunks.js'
import { colorForPpl, hashText, buildCpToUtf16Map } from '../src/util.js'
import { mapTokensThroughChanges, mapRangesThroughChanges } from '../src/editor.js'

let passed = 0
function ok(name, fn) {
  fn()
  passed++
  console.log('✓', name)
}

// ---------- 分块 ----------
ok('句子分块：中英文标点与换行', () => {
  const chunks = sentenceChunks('你好，世界。abc,def\nghi')
  assert.deepStrictEqual(chunks, [
    { start: 0, end: 3 },   // 你好，
    { start: 3, end: 6 },   // 世界。
    { start: 6, end: 10 },  // abc,
    { start: 10, end: 14 }, // def\n
    { start: 14, end: 17 }  // ghi
  ])
})

ok('段落分块：按换行', () => {
  const chunks = paragraphChunks('ab\ncd\nef')
  assert.deepStrictEqual(chunks, [
    { start: 0, end: 3 },
    { start: 3, end: 6 },
    { start: 6, end: 8 }
  ])
})

// ---------- 颜色 ----------
const stops = [
  { ppl: 12, color: '#22c55e' },
  { ppl: 18, color: '#eab308' },
  { ppl: 50, color: '#ef4444' },
  { ppl: 100, color: '#7f1d1d' }
]
ok('颜色：低于最小节点取端点色', () => assert.strictEqual(colorForPpl(5, stops), '#22c55e'))
ok('颜色：高于最大节点取端点色', () => assert.strictEqual(colorForPpl(500, stops), '#7f1d1d'))
ok('颜色：节点处精确取值', () => assert.strictEqual(colorForPpl(18, stops), '#eab308'))
ok('颜色：节点间渐变', () => {
  const mid = colorForPpl(15, stops) // 12 绿与 18 黄的中点
  assert.notStrictEqual(mid, '#22c55e')
  assert.notStrictEqual(mid, '#eab308')
  assert.match(mid, /^#[0-9a-f]{6}$/)
})

// ---------- 统计 ----------
ok('平均 NLL：跳过脏/忽略/null', () => {
  const tokens = [
    { nll: 1, ppl: Math.E, stale: false, ignored: false },
    { nll: 3, ppl: 20, stale: false, ignored: false },
    { nll: 100, ppl: 1e30, stale: true, ignored: false },
    { nll: 100, ppl: 1e30, stale: false, ignored: true },
    { nll: null, ppl: null, stale: false, ignored: false }
  ]
  const stat = avgNllOfTokens(tokens)
  assert.strictEqual(stat.count, 2)
  assert.strictEqual(stat.nll, 2)
})

ok('分层显示：n%-m% 区间', () => {
  const tokens = Array.from({ length: 10 }, (_, i) => ({
    tokenIndex: i, ppl: (i + 1) * 10, nll: 1, stale: false, ignored: false
  }))
  assert.strictEqual(visibleTokenSet(tokens, 0, 100).size, 10)
  assert.strictEqual(visibleTokenSet(tokens, 0, 10).size, 1) // 最低 10%
  const top = visibleTokenSet(tokens, 90, 100)
  assert.strictEqual(top.size, 1)
  assert.strictEqual([...top][0].ppl, 100) // 最高 10%
  assert.strictEqual(visibleTokenSet(tokens, 50, 60).size, 1)
})

// ---------- 工具 ----------
ok('hashText：稳定且区分', () => {
  assert.strictEqual(hashText('你好'), hashText('你好'))
  assert.notStrictEqual(hashText('你好'), hashText('你好！'))
})

ok('码点→UTF-16 映射：emoji 占 2 码元', () => {
  const text = 'a😀b'
  const map = buildCpToUtf16Map(text)
  // 码点 0='a'→0, 1='😀'→1, 2='b'→3, 3=末尾→4
  assert.deepStrictEqual(map, [0, 1, 3, 4])
})

// ---------- 脏标记（需求 6 的场景） ----------
function changeOf(doc, spec) {
  const state = EditorState.create({ doc })
  return state.update({ changes: spec }).changes
}

const tk = (start, end, extra = {}) => ({
  tokenIndex: 0, tokenId: 1, text: 'x', nll: 1, ppl: 2, stale: false, ignored: false, start, end, ...extra
})

ok('文首插入前缀：原 token 后移且保持干净', () => {
  // "你好"（token [0,2)），开头插入 "小明，"
  const changes = changeOf('你好', { from: 0, insert: '小明，' })
  const out = mapTokensThroughChanges([tk(0, 2)], changes)
  assert.strictEqual(out.length, 1)
  assert.deepStrictEqual([out[0].start, out[0].end], [3, 5])
  assert.strictEqual(out[0].stale, false)
})

ok('删除 token 内一个字符：变脏', () => {
  // "小明，你好" 中删除 "好"（位置 4..5），token "你好" [3,5)
  const changes = changeOf('小明，你好', { from: 4, to: 5 })
  const out = mapTokensThroughChanges([tk(3, 5)], changes)
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].stale, true)
})

ok('token 内部插入：变脏；边界插入：干净', () => {
  const inside = changeOf('你好', { from: 1, insert: 'x' })
  assert.strictEqual(mapTokensThroughChanges([tk(0, 2)], inside)[0].stale, true)
  const atStart = changeOf('你好', { from: 0, insert: 'x' })
  assert.strictEqual(mapTokensThroughChanges([tk(0, 2)], atStart)[0].stale, false)
  const atEnd = changeOf('你好', { from: 2, insert: 'x' })
  assert.strictEqual(mapTokensThroughChanges([tk(0, 2)], atEnd)[0].stale, false)
})

ok('token 被完整删除：丢弃', () => {
  const changes = changeOf('你好世界', { from: 0, to: 2 })
  const out = mapTokensThroughChanges([tk(0, 2), tk(2, 4, { tokenIndex: 1 })], changes)
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].tokenIndex, 1)
  assert.deepStrictEqual([out[0].start, out[0].end], [0, 2])
  assert.strictEqual(out[0].stale, false)
})

ok('替换选区（粘贴覆盖）：相交 token 变脏', () => {
  const changes = changeOf('你好世界', { from: 1, to: 3, insert: 'ABC' })
  const out = mapTokensThroughChanges([tk(0, 2), tk(2, 4, { tokenIndex: 1 })], changes)
  assert.strictEqual(out.every((t) => t.stale), true)
})

ok('忽略区间随编辑映射', () => {
  const changes = changeOf('你好世界', { from: 0, insert: 'AB' })
  const out = mapRangesThroughChanges([{ start: 0, end: 2 }], changes)
  assert.deepStrictEqual(out, [{ start: 2, end: 4 }])
})

ok('tokensInRange：选区相交', () => {
  const tokens = [tk(0, 2), tk(2, 4, { tokenIndex: 1 })]
  assert.strictEqual(tokensInRange(tokens, 1, 2).length, 1)
  assert.strictEqual(tokensInRange(tokens, 0, 4).length, 2)
  assert.strictEqual(tokensInRange(tokens, 2, 3).length, 1)
})

console.log(`\n全部 ${passed} 项测试通过`)
