// ---------- Chunking (sentence / paragraph) and statistics ----------
import type { ChangeSet } from '@codemirror/state'
import type { Token, Chunk, Range, ChunkMode, StatResult } from './types.ts'

// Sentence delimiters: common English/Chinese punctuation and newlines
// (a paragraph separator also counts as a sentence boundary).
const SENTENCE_DELIMS = /[.,;:!?。，；：！？、…\n]/

/**
 * Sentence chunking: contiguous runs split at punctuation or newlines;
 * the delimiter belongs to the preceding chunk.
 * Returns [{start, end}] (UTF-16 indices, half-open) covering the whole text, no zero-width chunks.
 */
export function sentenceChunks(text: string): Range[] {
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

/** Paragraph chunking: split at newlines (the newline itself belongs to the preceding chunk, keeping full coverage). */
export function paragraphChunks(text: string): Range[] {
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

/** Whether two half-open ranges intersect. */
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/**
 * Mark tokens ignored when they intersect any ignore range.
 * Both tokens and ignores use UTF-16 indices.
 */
export function markIgnored(tokens: Token[], ignores: Range[]): Token[] {
  for (const t of tokens) {
    t.ignored = ignores.some((r) => rangesOverlap(t.start, Math.max(t.end, t.start + 1), r.start, r.end))
  }
  return tokens
}

/**
 * Average NLL over a set of tokens (skipping stale/ignored/null-NLL tokens).
 * Returns null when no valid token exists. Average PPL = exp(avg NLL), matching the backend definition.
 */
export function avgNllOfTokens(tokens: Token[]): StatResult | null {
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

/** Tokens intersecting (or centered in) the half-open range [start, end). */
export function tokensInRange(tokens: Token[], start: number, end: number): Token[] {
  return tokens.filter((t) => {
    const ts = t.start
    const te = Math.max(t.end, t.start) // zero-width token treated as a point
    if (te === ts) return ts >= start && ts <= end
    return rangesOverlap(ts, te, start, end)
  })
}

/** Chunk statistics: one entry per chunk with its average PPL (null stat = no valid measurement). */
export function buildChunks(text: string, tokens: Token[], mode: ChunkMode): Chunk[] {
  const ranges = mode === 'paragraph' ? paragraphChunks(text) : sentenceChunks(text)
  return ranges.map((r) => {
    const members = tokensInRange(tokens, r.start, r.end)
    const ignored = members.length > 0 && members.every((t) => t.ignored)
    return { ...r, stat: ignored ? null : avgNllOfTokens(members), ignored }
  })
}

/** Layered display: visible token set sorted by PPL ascending (n% ~ m% percentile window). */
export function visibleTokenSet(tokens: Token[], n: number, m: number): Set<Token> {
  const measured = tokens
    .filter((t) => !t.stale && !t.ignored && t.ppl != null)
    .sort((a, b) => a.ppl! - b.ppl!)
  const visible = new Set<Token>()
  const total = measured.length
  measured.forEach((t, i) => {
    const pct = total === 0 ? 0 : (i / total) * 100
    if (pct >= n - 1e-9 && pct < m - 1e-9) visible.add(t)
    if (m >= 100 && i === total - 1) visible.add(t) // right endpoint inclusive
  })
  return visible
}

// ---------- Mapping tokens/ranges through edits ----------

/**
 * Map token ranges through a ChangeDesc:
 * - Tokens intersecting a delete/replace range become stale.
 * - Insertions strictly inside a token become stale.
 * - Insertions on a boundary do not (e.g. a prefix insertion shifts "你好" intact).
 * - Tokens whose range is emptied by an edit are dropped.
 */
export function mapTokensThroughChanges(tokens: Token[], changes: ChangeSet): Token[] {
  const edits: Array<[number, number]> = []
  changes.iterChanges((fromA, toA) => edits.push([fromA, toA]))
  const out: Token[] = []
  for (const t of tokens) {
    const zeroWidth = t.end <= t.start
    let stale = t.stale
    for (const [fA, tA] of edits) {
      if (fA === tA) {
        // Pure insertion: only strictly-inside insertions dirty the token;
        // hitting a zero-width token's position also dirties it.
        if (zeroWidth ? fA === t.start : fA > t.start && fA < t.end) stale = true
      } else if (rangesOverlap(fA, tA, t.start, Math.max(t.end, t.start + 1))) {
        stale = true
      }
    }
    const s = changes.mapPos(t.start, zeroWidth ? 0 : 1)
    const e = changes.mapPos(t.end, zeroWidth ? 0 : -1)
    if (zeroWidth ? stale : e <= s) continue // zero-width token dropped when dirty; normal token dropped when emptied
    out.push({ ...t, start: s, end: e, stale })
  }
  return out
}

export function mapRangesThroughChanges(ranges: Range[], changes: ChangeSet): Range[] {
  const out: Range[] = []
  for (const r of ranges) {
    const s = changes.mapPos(r.start, 1)
    const e = changes.mapPos(r.end, -1)
    if (e > s) out.push({ start: s, end: e })
  }
  return out
}