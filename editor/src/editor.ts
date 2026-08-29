// ---------- Editor (CodeMirror 6) ----------
// Responsibilities: text editing, undo/redo, the heat-map decoration layer,
// stale-token tracking, and hover/selection tooltips.
import { EditorState, StateField, StateEffect, Prec } from '@codemirror/state'
import { EditorView, keymap, drawSelection, Decoration, ViewPlugin, lineNumbers } from '@codemirror/view'
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

// ---------- Line-break overlay (non-editing display) ----------
// The '\n' stays a layout character invisible to editing. To still surface each
// covered break as a colored, hoverable glyph, we draw it in a separate absolute
// layer (`.cm-break-layer`) that is `pointer-events: none`, so caret/selection
// semantics remain native. Positions are re-measured whenever CodeMirror runs its
// measure pass (edits, analysis, settings, scrolling).

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

/** Content origin of the scroller, in client coordinates (LTR text). */
function contentOrigin(view: EditorView): { left: number; top: number } {
  const rect = view.scrollDOM.getBoundingClientRect()
  return {
    left: rect.left - view.scrollDOM.scrollLeft * view.scaleX,
    top: rect.top - view.scrollDOM.scrollTop * view.scaleY
  }
}

/** Break rectangles exposed for hover lookup (client coordinates). */
let breakHoverAreas: Array<{ pos: number; left: number; right: number; top: number; bottom: number }> = []

/** Newline pos currently hovered (drives the '¶' outline), or null. */
let hoveredBreakPos: number | null = null

/** Toggle the hover outline class on the matching '¶' glyph in the overlay. */
function setBreakHover(pos: number | null): void {
  if (pos === hoveredBreakPos) return
  const layer = document.querySelector('.cm-break-layer')
  if (layer) {
    if (hoveredBreakPos != null) {
      layer.querySelector(`.cm-br[data-br="${hoveredBreakPos}"]`)?.classList.remove('cm-br-hover')
    }
  }
  hoveredBreakPos = pos
  if (layer && pos != null) {
    layer.querySelector(`.cm-br[data-br="${pos}"]`)?.classList.add('cm-br-hover')
  }
}

interface CoverageResult {
  marks: Array<{ start: number; end: number; cls: string; style: string }>
  breaks: Array<{ pos: number; style: string }>
}

/** Shared coverage pass used both by the heat-map decoration and the overlay. */
function computeCoverage(
  state: EditorState,
  tokens: Token[],
  ignores: DocRange[],
  hoverKey: string | null
): CoverageResult {
  const marks: Array<{ start: number; end: number; cls: string; style: string }> = []
  const breaks: Array<{ pos: number; style: string }> = []
  const text = state.doc.toString()
  if (!text) return { marks, breaks }

  markIgnored(tokens, ignores)
  const addCovered = (from: number, to: number, cls: string, style: string, brkStyle: string): void => {
    if (to <= from) return
    let cur = from
    for (const p of newlinePositions(state, from, to)) {
      if (cur < p) marks.push({ start: cur, end: p, cls, style })
      breaks.push({ pos: p, style: brkStyle })
      cur = p + 1
    }
    if (cur < to) marks.push({ start: cur, end: to, cls, style })
  }
  const IGNORED_BRK = ignoredBreakStyle()
  const GRAY_BRK = breakStyleFor(GRAY)

  if (settings.chunkMode === 'token') {
    const visible = visibleTokenSet(tokens, settings.windowN, settings.windowM)
    for (const tk of tokens) {
      const hoverCls = hoverKey === `t${tk.tokenIndex}` ? ' hm-hover' : ''
      if (tk.ignored) {
        addCovered(tk.start, tk.end, 'hm hm-ignored' + hoverCls, ignoredStyle(), IGNORED_BRK)
      } else if (tk.stale || tk.ppl == null) {
        addCovered(tk.start, tk.end, 'hm' + hoverCls, heatStyle(GRAY), GRAY_BRK)
      } else if (visible.has(tk)) {
        const hex = colorForPpl(tk.ppl, settings.stops)
        addCovered(tk.start, tk.end, 'hm' + hoverCls, heatStyle(hex), breakStyleFor(hex))
      }
      // Tokens filtered out by the layered window get no decoration (heat map hidden).
    }
    // Only text not covered by any token (new input, unmeasured) gets gray;
    // tokens filtered out by the layered window get no decoration at all.
    const covered: Array<[number, number]> = tokens
      .filter((tk) => tk.end > tk.start)
      .map((tk) => [tk.start, tk.end] as [number, number])
      .sort((a, b) => a[0] - b[0])
    let cur = 0
    for (const [s, e] of covered) {
      if (s > cur) addCovered(cur, s, 'hm', heatStyle(GRAY), GRAY_BRK)
      cur = Math.max(cur, e)
    }
    if (cur < text.length) addCovered(cur, text.length, 'hm', heatStyle(GRAY), GRAY_BRK)
  } else {
    const chunks = buildChunks(text, tokens, settings.chunkMode)
    for (const c of chunks) {
      const hoverCls = hoverKey === `c${c.start}-${c.end}` ? ' hm-hover' : ''
      if (c.ignored) {
        addCovered(c.start, c.end, 'hm hm-ignored' + hoverCls, ignoredStyle(), IGNORED_BRK)
      } else if (!c.stat) {
        addCovered(c.start, c.end, 'hm' + hoverCls, heatStyle(GRAY), GRAY_BRK)
      } else {
        const hex = colorForPpl(c.stat.ppl, settings.stops)
        addCovered(c.start, c.end, 'hm' + hoverCls, heatStyle(hex), breakStyleFor(hex))
      }
    }
  }
  return { marks, breaks }
}

/** Rebuild the break overlay DOM for the current view state. */
function redrawBreakOverlay(view: EditorView, dom: HTMLElement): void {
  try {
    breakHoverAreas = []
    const field = view.state.field(hmField)
    const { breaks } = computeCoverage(view.state, field.tokens, field.ignores, null)
    const base = contentOrigin(view)
    const keep = new Set<string>()
    for (const b of breaks) {
      const rect = view.coordsAtPos(b.pos)
      if (!rect) continue
      const key = String(b.pos)
      keep.add(key)
      // The glyph is drawn from the caret slot rightwards; keep the hover hit
      // area wide enough for the visible '¶'.
      breakHoverAreas.push({ pos: b.pos, left: rect.left - 3, right: rect.left + 16, top: rect.top, bottom: rect.bottom })
      let el = dom.querySelector<HTMLElement>(`.cm-br[data-br="${key}"]`)
      if (!el) {
        el = document.createElement('div')
        el.className = 'cm-br'
        el.dataset.br = key
        el.textContent = '¶'
        dom.appendChild(el)
      }
      el.setAttribute('style', `${b.style}; left: ${rect.left - base.left}px; top: ${rect.top - base.top}px; height: ${rect.bottom - rect.top}px`)
      el.classList.toggle('cm-br-hover', hoveredBreakPos === b.pos)
    }
    for (const ch of [...dom.children]) {
      if (!keep.has((ch as HTMLElement).dataset.br ?? '')) ch.remove()
    }
  } catch (err) {
    console.error('break overlay error:', err)
  }
}

/**
 * Self-managed overlay for newline glyphs. Redrawn on every edit/analysis/setting
 * change and on scroll, and kept fully pointer-transparent, so caret and selection
 * semantics of the code editor are untouched.
 */
class BreakOverlay {
  view: EditorView
  dom: HTMLDivElement

  constructor(view: EditorView) {
    this.view = view
    this.dom = document.createElement('div')
    this.dom.className = 'cm-break-layer'
    view.scrollDOM.appendChild(this.dom)
    view.scrollDOM.addEventListener('scroll', this.redraw)
    requestAnimationFrame(() => this.redraw())
  }

  update(update: ViewUpdate): void {
    if (
      update.docChanged ||
      update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(setTokensEffect) || e.is(setIgnoresEffect) || e.is(refreshEffect))
      )
    ) {
      this.redraw()
    }
  }

  redraw = (): void => {
    redrawBreakOverlay(this.view, this.dom)
  }

  destroy(): void {
    this.view.scrollDOM.removeEventListener('scroll', this.redraw)
    this.dom.remove()
  }
}

/** Editor extension that paints the line-break overlay. */
export const breakOverlayPlugin = ViewPlugin.fromClass(BreakOverlay)

// ---------- Decoration construction ----------
function buildDeco(state: EditorState, data: { tokens: Token[]; ignores: DocRange[]; hoverKey: string | null }): DecorationSet {
  const { marks } = computeCoverage(state, data.tokens, data.ignores, data.hoverKey)

  // Build marks: strictly increasing, non-overlapping ranges (RangeSet requirement).
  marks.sort((a, b) => a.start - b.start || a.end - b.end)
  const markRanges: Range<Decoration>[] = []
  let lastEnd = -1
  for (const m of marks) {
    if (m.start < lastEnd) continue
    markRanges.push(Decoration.mark({ class: m.cls, attributes: { style: m.style } }).range(m.start, m.end))
    lastEnd = m.end
  }
  return Decoration.set(markRanges)
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

        // Newline overlay hover: if the pointer sits on a break glyph rectangle,
        // show that break's covering chunk (same info as any other position).
        const brHit = breakHoverAreas.find(
          (a) =>
            event.clientX >= a.left - 2 &&
            event.clientX <= a.right + 2 &&
            event.clientY >= a.top &&
            event.clientY <= a.bottom
        )
        if (brHit) {
          plugin.lastPos = -1 // overlay hover does not track a plain pos
          setBreakHover(brHit.pos)
          const st = infoAtPos(view.state, brHit.pos)
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

        setBreakHover(null)
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
        setBreakHover(null)
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
      breakOverlayPlugin,
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