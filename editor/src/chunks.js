// ---------- 分块（句子 / 段落）与统计 ----------

// 句子分隔符：英文/中文常见标点，以及换行（段落分隔符也算句子边界）
const SENTENCE_DELIMS = /[.,;:!?。，；：！？、…\n]/

/**
 * 句子分块：以标点或换行为界的连续片段，分隔符合入前一个块。
 * 返回 [{start, end}]（UTF-16 下标，半开区间），覆盖全文，无零宽块。
 */
export function sentenceChunks(text) {
  const chunks = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (SENTENCE_DELIMS.test(text[i])) {
      chunks.push({ start, end: i + 1 })
      start = i + 1
    }
  }
  if (start < text.length) chunks.push({ start, end: text.length })
  return chunks.filter((c) => c.end > c.start)
}

/** 段落分块：按换行切分（换行符本身归入前一段，保证全覆盖） */
export function paragraphChunks(text) {
  const chunks = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      chunks.push({ start, end: i + 1 })
      start = i + 1
    }
  }
  if (start < text.length) chunks.push({ start, end: text.length })
  return chunks.filter((c) => c.end > c.start)
}

/** 判断两个半开区间是否相交 */
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd
}

/**
 * 给 token 列表标注 ignored 标志（与任一忽略区间相交即忽略）。
 * tokens / ignores 均使用 UTF-16 下标。
 */
export function markIgnored(tokens, ignores) {
  for (const t of tokens) {
    t.ignored = ignores.some((r) => rangesOverlap(t.start, Math.max(t.end, t.start + 1), r.start, r.end))
  }
  return tokens
}

/**
 * 对一组 token 求平均 NLL（跳过未测量/脏数据/被忽略/nll 为 null 的 token）。
 * 返回 null 表示没有有效 token。平均 PPL = exp(平均 NLL)，与后端 average_ppl 定义一致。
 */
export function avgNllOfTokens(tokens) {
  let sum = 0
  let count = 0
  for (const t of tokens) {
    if (t.stale || t.ignored || t.nll == null) continue
    sum += t.nll
    count++
  }
  if (!count) return null
  const nll = sum / count
  return { nll, ppl: Math.exp(Math.min(nll, 80)), count }
}

/** 取与区间 [start, end) 相交（或中心落在其中）的 token */
export function tokensInRange(tokens, start, end) {
  return tokens.filter((t) => {
    const ts = t.start
    const te = Math.max(t.end, t.start) // 零宽 token 按点处理
    if (te === ts) return ts >= start && ts <= end
    return rangesOverlap(ts, te, start, end)
  })
}

/** 分块统计：返回块列表，每块附带平均 PPL 信息（信息为 null 表示无有效测量） */
export function buildChunks(text, tokens, mode) {
  const ranges = mode === 'paragraph' ? paragraphChunks(text) : sentenceChunks(text)
  return ranges.map((r) => {
    const members = tokensInRange(tokens, r.start, r.end)
    const ignored = members.length > 0 && members.every((t) => t.ignored)
    return { ...r, stat: ignored ? null : avgNllOfTokens(members), ignored }
  })
}

/** 分层显示：返回按 PPL 升序的可见 token 集合（n% ~ m% 区间） */
export function visibleTokenSet(tokens, n, m) {
  const measured = tokens
    .filter((t) => !t.stale && !t.ignored && t.ppl != null)
    .sort((a, b) => a.ppl - b.ppl)
  const visible = new Set()
  const total = measured.length
  measured.forEach((t, i) => {
    const pct = total === 0 ? 0 : (i / total) * 100
    if (pct >= n - 1e-9 && pct < m - 1e-9) visible.add(t)
    if (m >= 100 && i === total - 1) visible.add(t) // 右端点闭区间
  })
  return visible
}
