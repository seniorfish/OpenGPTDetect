// ---------- ppl smoothing (token window / sentence average) ----------
// Pure functions shared by the renderers (editor heat layer, extension heatmap)
// and the Python measure scripts. `text` is only needed for sentence mode.

export type SmoothMode = 'token' | 'sentence'

export interface SmoothToken {
  ppl: number | null
  /** Token text; used by 'sentence' mode to find sentence boundaries. */
  text?: string
}

/** Sentence-separating characters (both CJK and ASCII, plus newline). */
const SENT_END = /[。！？；!?;\n]/

/** Average of non-null values (null when there are none). */
function avg(vals: number[]): number | null {
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

/**
 * Compute a smoothed ppl per token.
 * - 'token': centered moving average with the given window size (1 = raw).
 * - 'sentence': average of each sentence group delimited by SENT_END.
 */
export function smoothTokens(
  tokens: SmoothToken[],
  mode: SmoothMode,
  windowSize: number,
): (number | null)[] {
  const ppls = tokens.map((t) => (t && t.ppl != null ? t.ppl : null))
  const out: (number | null)[] = new Array(tokens.length).fill(null)

  if (mode === 'sentence') {
    let curStart = 0
    const groups: [number, number][] = []
    for (let i = 0; i < tokens.length; i++) {
      const txt = tokens[i]!.text || ''
      if (SENT_END.test(txt)) {
        groups.push([curStart, i])
        curStart = i + 1
      }
    }
    if (curStart <= tokens.length - 1) groups.push([curStart, tokens.length - 1])
    if (!groups.length) groups.push([0, tokens.length - 1])
    for (const [s, e] of groups) {
      const vals: number[] = []
      for (let i = s; i <= e; i++) if (ppls[i] != null) vals.push(ppls[i]!)
      const v = avg(vals)
      for (let i = s; i <= e; i++) out[i] = v
    }
    return out
  }

  // token window (centered)
  const w = Math.max(1, windowSize | 0)
  const half = Math.floor((w - 1) / 2)
  for (let i = 0; i < tokens.length; i++) {
    const vals: number[] = []
    for (let j = i - half; j <= i + (w - 1 - half); j++) {
      if (j >= 0 && j < tokens.length && ppls[j] != null) vals.push(ppls[j]!)
    }
    out[i] = avg(vals)
  }
  return out
}
