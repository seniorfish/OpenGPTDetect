// ---------- Unit measurement helpers (pure) ----------
import type { TokenDetail } from './schemas.ts'

export type Lang = 'zh' | 'en'

/** English letter ratio >= threshold => 'en', otherwise 'zh' (no letters => 'zh'). */
export function detectLang(text: string, englishCharRatioThreshold: number): Lang {
  const letters = text.replace(/\s/g, '')
  if (!letters.length) return 'zh'
  const en = (letters.match(/[A-Za-z]/g) || []).length
  return en / letters.length >= englishCharRatioThreshold ? 'en' : 'zh'
}

/**
 * Split text into chunks of at most maxChars, preferring sentence boundaries.
 * Each piece is a contiguous substring of the original text (boundary whitespace
 * kept so token offsets stay exact); `start` is its offset within the source.
 */
export function splitChunks(text: string, maxChars: number, lang: Lang): { text: string; start: number }[] {
  if (text.length <= maxChars) return [{ text, start: 0 }]
  const sepRe = lang === 'en' ? /[.!?;]\s+|\n+/g : /[。！？；!?]\n?|\n+/g
  // Collect sentence-end boundary positions (index right after the separator).
  const bounds: number[] = []
  let m: RegExpExecArray | null
  sepRe.lastIndex = 0
  while ((m = sepRe.exec(text))) {
    bounds.push(sepRe.lastIndex)
    if (sepRe.lastIndex === m.index) sepRe.lastIndex++ // guard against zero-width
  }
  bounds.push(text.length)

  const out: { text: string; start: number }[] = []
  let pos = 0
  let bi = 0
  while (pos < text.length) {
    // Farthest sentence boundary e with e - pos <= maxChars.
    let e = -1
    while (bi < bounds.length && bounds[bi]! - pos <= maxChars) {
      e = bounds[bi]!
      bi++
    }
    if (e <= pos) {
      // A single sentence is longer than maxChars: hard-cut.
      e = pos + maxChars
      while (bi > 0 && bounds[bi - 1]! > e) bi--
    }
    out.push({ text: text.slice(pos, e), start: pos })
    pos = e
  }
  return out
}

/** Shift token char ranges (already relative to a chunk) by the chunk's start in the unit. */
export function offsetTokens(tokens: TokenDetail[], chunkStart: number): TokenDetail[] {
  return tokens.map((t) => ({
    ...t,
    char_start: t.char_start == null ? null : t.char_start + chunkStart,
    char_end: t.char_end == null ? null : t.char_end + chunkStart
  }))
}

export interface TokenStats {
  avgNll: number | null
  avgPpl: number | null
  nValid: number
}

/** Average nll over i >= 1 tokens (null-skips) and the derived average ppl. */
export function computeStats(tokens: TokenDetail[]): TokenStats {
  let nValid = 0
  let sumNll = 0
  for (const t of tokens) {
    if (t.nll != null) {
      nValid++
      sumNll += t.nll
    }
  }
  const avgNll = nValid ? sumNll / nValid : null
  return { avgNll, avgPpl: avgNll != null ? Math.exp(avgNll) : null, nValid }
}
