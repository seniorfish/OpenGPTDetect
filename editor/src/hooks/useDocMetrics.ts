// ---------- Derived document/caret metrics (React side) ----------
// The document's truth (text, tokens, ignores) lives in the CodeMirror editor,
// not in a store. This hook re-derives the status/coverage numbers on every
// `drawTick`/`cursorTick` bump — the "derived state never enters the store"
// rule applied to the command-line/imperative core.
import { useMemo } from 'react'
import { useAppStore } from '../stores/app.ts'
import { avgNllOfTokens, isIgnored, mergeIgnoreRanges } from '../chunks.ts'

export interface DocMetrics {
  charCount: number
  avgNll: number | null
  avgPpl: number | null
  coverage: number | null
  cursorLine: number
  cursorCol: number
}

const EMPTY: DocMetrics = {
  charCount: 0,
  avgNll: null,
  avgPpl: null,
  coverage: null,
  cursorLine: 1,
  cursorCol: 1
}

/** Recompute document aggregates + caret metrics from the live editor. */
export function useDocMetrics(): DocMetrics {
  const drawTick = useAppStore((s) => s.drawTick)
  const cursorTick = useAppStore((s) => s.cursorTick)

  return useMemo(() => {
    const editor = useAppStore.getState().editor
    if (!editor) return EMPTY
    const view = editor.view
    const doc = view.state.doc
    const len = doc.length
    const tokens = editor.getTokens()
    const merged = mergeIgnoreRanges(editor.getIgnores())
    const stat = avgNllOfTokens(tokens, merged)
    let covered = 0
    for (const tk of tokens) {
      if (!tk.stale && !isIgnored(tk.start, tk.end, merged)) covered += Math.max(0, tk.end - tk.start)
    }
    const head = view.state.selection.main.head
    const line = doc.lineAt(head)
    return {
      charCount: len,
      avgNll: stat ? stat.nll : null,
      avgPpl: stat ? stat.ppl : null,
      coverage: len ? Math.min(100, (covered / len) * 100) : null,
      cursorLine: line.number,
      cursorCol: head - line.from + 1
    }
  }, [drawTick, cursorTick])
}