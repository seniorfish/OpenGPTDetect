// ---------- Editor (CodeMirror 6) ----------
// Responsibilities: text editing, undo/redo, the heat-map decoration layer,
// stale-token tracking, and hover/selection tooltips.
import { EditorState, StateField, StateEffect, Prec } from '@codemirror/state'
import { EditorView, keymap, drawSelection, Decoration, ViewPlugin, lineNumbers, WidgetType } from '@codemirror/view'
import type { Transaction } from '@codemirror/state'
import type { Range } from '@codemirror/state'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands'
import { settings } from './composables/useSettings.ts'
import { rgba, clamp, colorForPpl, escapeHtml } from './util.ts'
import { t } from './i18n.ts'
import {
  buildChunks, markIgnored, visibleTokenSet, avgNllOfTokens, tokensInRange,
  mapTokensThroughChanges, mapRangesThroughChanges
} from './chunks.ts'
import type { Token, Range as DocRange, PplResponse, StatResult } from './types.ts'

const GRAY = '#8a8a8a' // color for unmeasured/stale data

// ---------- State effects ----------
const setTokensEffect = StateEffect.define<{ tokens: Token[] }>() // analysis result lands
const setIgnoresEffect = StateEffect.define<{ ranges: DocRange[] }>() // ignores updated
const setHoverEffect = StateEffect.define<{ key: string | null }>() // hovered chunk key
const refreshEffect = StateEffect.define<null>() // setting change: rebuild decorations

// ---------- Decoration styles ----------
function heatStyle(hex: string): string {
  const parts: string[] = []
  if (settings.style === 'background' || settings.style === 'both') {
    parts.push(`background-color: ${rgba(hex, settings.opacity)}`)
  }
  if (settings.style === 'underline' || settings.style === 'both') {
    parts.push(
      'text-decoration: underline',
      `text-decoration-color: ${hex}`,
      'text-decoration-thickness: 2px',
      'text-underline-offset: 3px'
    )
  }
  return parts.join('; ')
}

function ignoredStyle(): string {
  return `background-color: ${rgba(GRAY, 0.12)}; border-bottom: 1px dotted ${GRAY}`
}

// ---------- Decoration construction ----------

/** Inline newline glyph: rendered at every covered '\n' so breaks are visible
 *  and hoverable; its background matches the covering mark's heat color. */
class BreakWidget extends WidgetType {
  style: string
  pos: number

  constructor(style: string, pos: number) {
    super()
    this.style = style
    this.pos = pos
  }

  eq(other: BreakWidget): boolean {
    return other.style === this.style && other.pos === this.pos
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-br'
    if (this.style) span.setAttribute('style', this.style)
    span.dataset.br = String(this.pos)
    span.textContent = '¶'
    return span
  }

  ignoreEvent(): boolean {
    return true // do not trigger cursor movement or selection on the glyph
  }
}

function breakStyleFor(hex: string): string {
  return `background-color: ${rgba(hex, settings.opacity)}; color: rgba(20, 24, 28, 0.35)`
}

function ignoredBreakStyle(): string {
  return `background-color: ${rgba(GRAY, 0.12)}; color: rgba(138, 138, 138, 0.9)`
}

/** Positions of '\n' characters inside the half-open doc range [from, to). */
function newlinePositions(state: EditorState, from: number, to: number): number[] {
  const out: number[] = []
  const doc = state.doc
  const lo = Math.max(0, Math.min(from, doc.length))
  const hi = Math.min(to, doc.length)
  if (hi <= lo) return out
  let line = doc.lineAt(lo)
  while (line.number <= doc.lines) {
    const br = line.to
    if (br >= hi) break
    // br is the newline char position on every line but the document's last one.
    if (br >= lo && line.number < doc.lines) out.push(br)
    if (line.number >= doc.lines) break
    line = doc.line(line.number + 1)
  }
  return out
}

function buildDeco(state: EditorState, data: { tokens: Token[]; ignores: DocRange[]; hoverKey: string | null }): DecorationSet {
  const { tokens, ignores, hoverKey } = data
  const text = state.doc.toString()
  if (!text) return Decoration.none

  markIgnored(tokens, ignores)
  const marks: Array<{ start: number; end: number; cls: string; style: string; brk: string | null }> = []
  const addMark = (start: number, end: number, cls: string, style: string, brk: string | null): void => {
    if (end > start) marks.push({ start, end, cls, style, brk })
  }
  const IGNORED_BRK = ignoredBreakStyle()
  const GRAY_BRK = breakStyleFor(GRAY)

  if (settings.chunkMode === 'token') {
    const visible = visibleTokenSet(tokens, settings.windowN, settings.windowM)
    for (const tk of tokens) {
      const hoverCls = hoverKey === `t${tk.tokenIndex}` ? ' hm-hover' : ''
      if (tk.ignored) {
        addMark(tk.start, tk.end, 'hm hm-ignored' + hoverCls, ignoredStyle(), IGNORED_BRK)
      } else if (tk.stale || tk.ppl == null) {
        addMark(tk.start, tk.end, 'hm' + hoverCls, heatStyle(GRAY), GRAY_BRK)
      } else if (visible.has(tk)) {
        const hex = colorForPpl(tk.ppl, settings.stops)
        addMark(tk.start, tk.end, 'hm' + hoverCls, heatStyle(hex), breakStyleFor(hex))
      }
      // Tokens filtered out by the layered window get no decoration (heat map hidden).
    }
    // Only text not covered by any token (new input, unmeasured) gets gray;
    // tokens filtered out by the layered window get no decoration at all.
    const covered: Array<[number, number]> = tokens
      .filter((tk) => tk.end > tk.start)
      .map((tk) => [tk.start, tk.end] as [number, number])
      .sort((a, b) => a[0] - b[0])
    const gaps: Array<{ start: number; end: number; cls: string; style: string; brk: string | null }> = []
    let cur = 0
    for (const [s, e] of covered) {
      if (s > cur) gaps.push({ start: cur, end: s, cls: 'hm', style: heatStyle(GRAY), brk: GRAY_BRK })
      cur = Math.max(cur, e)
    }
    if (cur < text.length) gaps.push({ start: cur, end: text.length, cls: 'hm', style: heatStyle(GRAY), brk: GRAY_BRK })
    marks.push(...gaps)
  } else {
    const chunks = buildChunks(text, tokens, settings.chunkMode)
    for (const c of chunks) {
      const hoverCls = hoverKey === `c${c.start}-${c.end}` ? ' hm-hover' : ''
      if (c.ignored) {
        addMark(c.start, c.end, 'hm hm-ignored' + hoverCls, ignoredStyle(), IGNORED_BRK)
      } else if (!c.stat) {
        addMark(c.start, c.end, 'hm' + hoverCls, heatStyle(GRAY), GRAY_BRK)
      } else {
        const hex = colorForPpl(c.stat.ppl, settings.stops)
        addMark(c.start, c.end, 'hm' + hoverCls, heatStyle(hex), breakStyleFor(hex))
      }
    }
  }

  // Build marks: strictly increasing, non-overlapping ranges (RangeSet requirement).
  marks.sort((a, b) => a.start - b.start || a.end - b.end)
  const markRanges: Range<Decoration>[] = []
  let lastEnd = -1
  for (const m of marks) {
    if (m.start < lastEnd) continue
    markRanges.push(Decoration.mark({ class: m.cls, attributes: { style: m.style } }).range(m.start, m.end))
    lastEnd = m.end
  }

  // Newline glyphs: one point decoration per covered break, colored like its mark.
  const widgetRanges: Range<Decoration>[] = []
  for (const m of marks) {
    if (!m.brk) continue
    for (const p of newlinePositions(state, m.start, m.end)) {
      widgetRanges.push(Decoration.widget({ widget: new BreakWidget(m.brk, p), side: -1 }).range(p))
    }
  }

  // RangeSet requires ranges sorted by `from`, then by `startSide`; widgets have
  // startSide -1 so they must come before a mark sharing the same position.
  const sideOrder = (a: Range<Decoration>, b: Range<Decoration>): number =>
    a.from - b.from || a.value.startSide - b.value.startSide
  widgetRanges.sort(sideOrder)

  // Merge the two sorted sequences into one sorted set (a widget may sit inside a mark).
  const merged: Range<Decoration>[] = []
  let i = 0
  let j = 0
  while (i < markRanges.length || j < widgetRanges.length) {
    if (j >= widgetRanges.length || (i < markRanges.length && sideOrder(markRanges[i], widgetRanges[j]) <= 0)) {
      merged.push(markRanges[i++])
    } else {
      merged.push(widgetRanges[j++])
    }
  }
  return Decoration.set(merged)
}

// ---------- Heat-map state field ----------
interface HMValue {
  tokens: Token[]
  ignores: DocRange[]
  hoverKey: string | null
  deco: DecorationSet
}

export const hmField: StateField<HMValue> = StateField.define<HMValue>({
  create: (): HMValue => ({ tokens: [], ignores: [], hoverKey: null, deco: Decoration.none }),
  update(value, tr: Transaction): HMValue {
    let { tokens, ignores, hoverKey } = value
    let rebuild = false
    if (tr.docChanged) {
      tokens = mapTokensThroughChanges(tokens, tr.changes)
      ignores = mapRangesThroughChanges(ignores, tr.changes)
      rebuild = true
    }
    for (const e of tr.effects) {
      if (e.is(setTokensEffect)) {
        tokens = e.value.tokens
        rebuild = true
      } else if (e.is(setIgnoresEffect)) {
        ignores = e.value.ranges
        rebuild = true
      } else if (e.is(setHoverEffect)) {
        hoverKey = e.value.key
        rebuild = true
      } else if (e.is(refreshEffect)) {
        rebuild = true
      }
    }
    const deco = rebuild ? buildDeco(tr.state, { tokens, ignores, hoverKey }) : value.deco
    return { tokens, ignores, hoverKey, deco }
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco)
})

// ---------- Tooltips ----------
type Tooltip = { el: HTMLDivElement | null }

function makeTooltipEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'ppl-tooltip'
  el.style.display = 'none'
  document.body.appendChild(el)
  return el
}

const hoverTip: Tooltip = { el: null }
const selTip: Tooltip = { el: null }

function showTip(tip: Tooltip, html: string, x: number, y: number): void {
  if (!tip.el) tip.el = makeTooltipEl()
  const el = tip.el
  el.innerHTML = html
  el.style.display = 'block'
  const rect = el.getBoundingClientRect()
  el.style.left = clamp(x - rect.width / 2, 4, window.innerWidth - rect.width - 4) + 'px'
  const above = y - rect.height - 10
  el.style.top = (above > 4 ? above : y + 18) + 'px'
}

function hideTip(tip: Tooltip): void {
  if (tip.el) tip.el.style.display = 'none'
}

function statHtml(stat: StatResult | null): string {
  if (!stat) return `<span class="tip-dim">${t('tooltip.unmeasured')}</span>`
  // Labels come from i18n; markup is assembled here to keep messages free of HTML.
  const ppl = stat.ppl < 1000 ? stat.ppl.toPrecision(3) : stat.ppl.toExponential(2)
  return (
    `${t('tooltip.statPpl')} <b>${ppl}</b> · ${t('tooltip.statNll')} ${stat.nll.toFixed(3)} ` +
    `<span class="tip-dim">${t('tooltip.statCount', { count: stat.count })}</span>`
  )
}

/** Statistics for the chunk at a document position under the current chunking mode. */
function infoAtPos(state: EditorState, pos: number): { key: string; label: string; stat: StatResult | null } | null {
  const { tokens, ignores } = state.field(hmField)
  const text = state.doc.toString()
  if (!text) return null
  markIgnored(tokens, ignores)
  if (settings.chunkMode === 'token') {
    // Prefer a real (non-zero-width) token covering the position; only fall back
    // to a zero-width token pinned exactly at it. This stops hover from latching
    // onto degenerate tokens at chunk boundaries (e.g. line-end positions).
    const tk =
      tokens.find((tm) => (tm.end > tm.start ? tm.start <= pos && pos < tm.end : false)) ??
      tokens.find((tm) => tm.end <= tm.start && tm.start === pos)
    if (!tk) return null
    const suffix = tk.ignored ? t('tooltip.ignored') : tk.stale ? t('tooltip.stale') : ''
    const stat = tk.ignored || tk.stale || tk.nll == null || tk.ppl == null
      ? null
      : { nll: tk.nll, ppl: tk.ppl, count: 1 }
    return { key: `t${tk.tokenIndex}`, label: t('tooltip.tokenLabel', { index: tk.tokenIndex, text: tk.text, suffix }), stat }
  }
  const chunks = buildChunks(text, tokens, settings.chunkMode)
  const c = chunks.find((ck) => ck.start <= pos && pos < ck.end)
  if (!c) return null
  const name = settings.chunkMode === 'sentence' ? t('tooltip.sentence') : t('tooltip.paragraph')
  return {
    key: `c${c.start}-${c.end}`,
    label: name + (c.ignored ? t('tooltip.ignored') : ''),
    stat: c.ignored ? null : c.stat
  }
}

/**
 * Whether the pointer sits on rendered line text. Positions that map to the
 * empty margin around a line (line start/end whitespace, blank lines) are
 * rejected so no tooltip appears where no measurable text is visible.
 * Explanation: `posAtCoords` maps coordinates in the empty margin to adjacent
 * line-boundary document positions, which otherwise line up with neighboring
 * chunks/tokens. `coordsAtPos` returns client rects, i.e. the same space as
 * clientX/clientY, so comparing the two rejects those margins.
 */
function isPointerOnText(view: EditorView, pos: number, x: number, y: number): boolean {
  const line = view.state.doc.lineAt(pos)
  const start = view.coordsAtPos(line.from)
  if (!start) return true // cannot measure: fall back to showing rather than hiding
  const end = view.coordsAtPos(line.to)
  // Horizontal span of the line's text: from the first character's left edge to
  // the caret box just past the last character. Vertical span from the same
  // client rects (coordsAtPos returns client coordinates, like clientX/Y).
  const TOL = 2 // small tolerance so the caret edge feels inclusive
  const right = end ? Math.max(end.left, end.right) : start.right
  return x >= start.left - TOL && x <= right + TOL && y >= start.top && y <= start.bottom
}

/** Hover plugin: mousemove locates the chunk, highlights it, and pops its PPL tooltip. */
class Hover {
  view: EditorView
  key: string | null
  lastPos: number

  constructor(view: EditorView) {
    this.view = view
    this.key = null
    this.lastPos = -1
  }

  update(): void {
    // Re-validate the hovered position after document/setting changes.
    // Synchronous dispatch is not allowed inside an update cycle; defer to the next tick.
    if (this.lastPos < 0) return
    const st = infoAtPos(this.view.state, Math.min(this.lastPos, this.view.state.doc.length))
    const key = st ? st.key : null
    if (key !== this.key) {
      this.key = key
      const view = this.view
      setTimeout(() => {
        view.dispatch({ effects: setHoverEffect.of({ key }) })
      }, 0)
    }
  }

  setKey(key: string | null): void {
    if (key === this.key) return
    this.key = key
    this.view.dispatch({ effects: setHoverEffect.of({ key }) })
  }

  destroy(): void {
    hideTip(hoverTip)
  }
}

function buildHoverPlugin(): ViewPlugin<Hover> {
  let pluginRef: ViewPlugin<Hover> | null = null
  pluginRef = ViewPlugin.fromClass(Hover, {
    eventHandlers: {
      mousemove(event, view) {
        const plugin = view.plugin(pluginRef!)
        if (!plugin) return

        // Newline glyph hover: the break is a real (decorated) position, so show
        // its covering chunk like any other character. The event target can be
        // the glyph's text node, so climb to the element before matching.
        const node = event.target as Node | null
        const el = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element | null)
        const br = el ? el.closest('.cm-br') : null
        if (br) {
            plugin.lastPos = -1 // glyph hover does not track a plain pos
            const pos = Number((br as HTMLElement).dataset.br)
            const st = Number.isFinite(pos) ? infoAtPos(view.state, pos) : null
            const key = st ? st.key : null
            if (key !== plugin.key) plugin.setKey(key)
            if (st) {
              showTip(
                hoverTip,
                `<div class="tip-label">${escapeHtml(st.label)}</div>${statHtml(st.stat)}`,
                event.clientX,
                event.clientY
              )
            } else {
              hideTip(hoverTip)
            }
            return
          }

        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos == null || !isPointerOnText(view, pos, event.clientX, event.clientY)) {
          // Pointer over empty margin (line start/end whitespace, blank line):
          // nothing measurable is under the cursor, so suppress the tooltip.
          plugin.lastPos = -1
          plugin.setKey(null)
          hideTip(hoverTip)
          return
        }
        plugin.lastPos = pos
        const st = infoAtPos(view.state, pos)
        const key = st ? st.key : null
        if (key !== plugin.key) plugin.setKey(key)
        if (st) {
          showTip(
            hoverTip,
            `<div class="tip-label">${escapeHtml(st.label)}</div>${statHtml(st.stat)}`,
            event.clientX,
            event.clientY
          )
        } else {
          hideTip(hoverTip)
        }
      },
      mouseleave(_event, view) {
        const plugin = view.plugin(pluginRef!)
        if (plugin) {
          plugin.lastPos = -1
          plugin.setKey(null)
        }
        hideTip(hoverTip)
      }
    }
  })
  return pluginRef
}

// ---------- Public interface ----------
export interface EditorCallbacks {
  onDocChanged: (update: ViewUpdate) => void
  onSelectionChanged: (update: ViewUpdate) => void
  onAnalyze: () => void
}

export interface EditorApi {
  view: EditorView
  /** Land analysis results: convert backend token_details to internal tokens (UTF-16 indices) and refresh decorations. */
  applyAnalysis: (data: PplResponse, cpMap: number[]) => void
  /** Rebuild decorations after setting changes (colors/style/chunk mode/layer window). */
  refreshDecorations: () => void
  getTokens: () => Token[]
  getIgnores: () => DocRange[]
  setIgnores: (ranges: DocRange[]) => void
  addIgnore: (start: number, end: number) => void
  undo: () => void
  redo: () => void
  applyFonts: () => void
}

export function createEditor(parent: HTMLElement, callbacks: EditorCallbacks): EditorApi {
  const { onDocChanged, onSelectionChanged } = callbacks

  function handleSelectionTooltip(v: EditorView): void {
    const sel = v.state.selection.main
    if (sel.empty) {
      hideTip(selTip)
      return
    }
    const { tokens, ignores } = v.state.field(hmField)
    markIgnored(tokens, ignores)
    const stat = avgNllOfTokens(tokensInRange(tokens, sel.from, sel.to))
    const html = `<div class="tip-label">${t('tooltip.selection', { chars: sel.to - sel.from })}</div>${statHtml(stat)}`
    const coords = v.coordsAtPos(sel.head) || v.coordsAtPos(sel.from)
    if (!coords) return
    showTip(selTip, html, (coords.left + coords.right) / 2, coords.top)
  }

  const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
    if (update.docChanged) {
      onDocChanged(update)
    }
    if (update.selectionSet || update.docChanged) {
      handleSelectionTooltip(update.view)
      onSelectionChanged(update)
    }
  })

  const state = EditorState.create({
    doc: '',
    extensions: [
      lineNumbers(),
      history(),
      drawSelection(),
      EditorView.lineWrapping,
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              callbacks.onAnalyze?.()
              return true
            }
          }
        ])
      ),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      hmField,
      buildHoverPlugin(),
      updateListener,
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { overflow: 'auto' }
      })
    ]
  })

  const view = new EditorView({ state, parent })
  applyFonts(view)

  const api: EditorApi = {
    view,

    /** Land analysis results: convert backend char indices to UTF-16 offsets and refresh decorations. */
    applyAnalysis(data, cpMap) {
      const tokens: Token[] = []
      for (const d of data.token_details) {
        let start: number | null = d.char_start == null ? null : cpMap[d.char_start]
        let end: number | null = d.char_end == null ? null : cpMap[d.char_end]
        if (start == null || end == null) {
          // Unalignable token: zero-width, attached at the previous token's end.
          start = end = tokens.length ? tokens[tokens.length - 1].end : 0
        }
        tokens.push({
          tokenIndex: d.token_index,
          tokenId: d.token_id,
          text: d.token_text,
          nll: d.nll,
          ppl: d.ppl,
          start,
          end,
          stale: false,
          ignored: false
        })
      }
      view.dispatch({ effects: setTokensEffect.of({ tokens }) })
    },

    refreshDecorations() {
      view.dispatch({ effects: refreshEffect.of(null) })
    },

    getTokens() {
      return view.state.field(hmField).tokens
    },

    getIgnores() {
      return view.state.field(hmField).ignores
    },

    setIgnores(ranges) {
      view.dispatch({ effects: setIgnoresEffect.of({ ranges }) })
    },

    addIgnore(start, end) {
      const cur = api.getIgnores()
      api.setIgnores([...cur, { start, end }].sort((a, b) => a.start - b.start))
    },

    undo() {
      undo(view)
    },
    redo() {
      redo(view)
    },

    applyFonts() {
      applyFonts(view)
    }
  }
  return api
}

export function applyFonts(view: EditorView): void {
  view.contentDOM.style.fontSize = settings.fontSize + 'px'
  view.contentDOM.style.fontFamily = settings.fontFamily
  view.scrollDOM.style.fontFamily = settings.fontFamily
}