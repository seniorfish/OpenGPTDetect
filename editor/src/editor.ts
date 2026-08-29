// ---------- 编辑器（CodeMirror 6）----------
// 职责：文本编辑、撤销/重做、热力图装饰层、脏 token 追踪、悬停/选区提示。

import { EditorState, StateField, StateEffect, Prec } from '@codemirror/state'
import { EditorView, keymap, drawSelection, Decoration, ViewPlugin, lineNumbers } from '@codemirror/view'
import type { ChangeSet, Transaction } from '@codemirror/state'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands'
import { settings } from './store.ts'
import { rgba, clamp, colorForPpl, escapeHtml } from './util.ts'
import {
  buildChunks, markIgnored, visibleTokenSet, avgNllOfTokens, tokensInRange, rangesOverlap
} from './chunks.ts'
import type { Token, Range as DocRange, PplResponse, StatResult } from './types.ts'

const GRAY = '#8a8a8a' // 未测量/脏数据颜色

// ---------- 状态效果 ----------
const setTokensEffect = StateEffect.define<{ tokens: Token[] }>() // {tokens} 分析结果落地
const setIgnoresEffect = StateEffect.define<{ ranges: DocRange[] }>() // {ranges:[{start,end}]}
const setHoverEffect = StateEffect.define<{ key: string | null }>() // {key|null}
const refreshEffect = StateEffect.define<null>() // 配置变化，重建装饰

// ---------- 编辑引起的 token 映射与脏标记 ----------
/**
 * 通过 ChangeDesc 映射 token 区间：
 * - 与删除/替换区间相交的 token → 脏（stale）
 * - 严格落在 token 内部的插入 → 脏
 * - 边界上的插入不影响（如文首插入前缀，"你好" 原样后移）
 * - 区间被删空的 token → 丢弃
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
        // 纯插入：只有严格落在内部才弄脏；落在零宽 token 位置也算弄脏
        if (zeroWidth ? fA === t.start : fA > t.start && fA < t.end) stale = true
      } else if (rangesOverlap(fA, tA, t.start, Math.max(t.end, t.start + 1))) {
        stale = true
      }
    }
    const s = changes.mapPos(t.start, zeroWidth ? 0 : 1)
    const e = changes.mapPos(t.end, zeroWidth ? 0 : -1)
    if (zeroWidth ? stale : e <= s) continue // 零宽 token 弄脏即丢弃；普通 token 删空即丢弃
    out.push({ ...t, start: s, end: e, stale })
  }
  return out
}

export function mapRangesThroughChanges(ranges: DocRange[], changes: ChangeSet): DocRange[] {
  const out: DocRange[] = []
  for (const r of ranges) {
    const s = changes.mapPos(r.start, 1)
    const e = changes.mapPos(r.end, -1)
    if (e > s) out.push({ start: s, end: e })
  }
  return out
}

// ---------- 装饰样式 ----------
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

// ---------- 装饰构建 ----------
function buildDeco(state: EditorState, data: { tokens: Token[]; ignores: DocRange[]; hoverKey: string | null }): DecorationSet {
  const { tokens, ignores, hoverKey } = data
  const text = state.doc.toString()
  if (!text) return Decoration.none

  markIgnored(tokens, ignores)
  const marks: Array<{ start: number; end: number; cls: string; style: string }> = []
  const addMark = (start: number, end: number, cls: string, style: string): void => {
    if (end > start) marks.push({ start, end, cls, style })
  }

  if (settings.chunkMode === 'token') {
    const visible = visibleTokenSet(tokens, settings.windowN, settings.windowM)
    for (const t of tokens) {
      const hoverCls = hoverKey === `t${t.tokenIndex}` ? ' hm-hover' : ''
      if (t.ignored) {
        addMark(t.start, t.end, 'hm hm-ignored' + hoverCls, ignoredStyle())
      } else if (t.stale || t.ppl == null) {
        addMark(t.start, t.end, 'hm' + hoverCls, heatStyle(GRAY))
      } else if (visible.has(t)) {
        addMark(t.start, t.end, 'hm' + hoverCls, heatStyle(colorForPpl(t.ppl, settings.stops)))
      }
      // 分层显示中被过滤掉的 token：不加装饰（隐藏热力图）
    }
    // 只有"未被任何 token 覆盖的文字"（新输入、未测量）才补灰色；
    // 被分层窗口过滤掉的 token 不加任何装饰（不显示热力图，也不是灰色）
    const covered: Array<[number, number]> = tokens
      .filter((t) => t.end > t.start)
      .map((t) => [t.start, t.end] as [number, number])
      .sort((a, b) => a[0] - b[0])
    const gaps: Array<{ start: number; end: number; cls: string; style: string }> = []
    let cur = 0
    for (const [s, e] of covered) {
      if (s > cur) gaps.push({ start: cur, end: s, cls: 'hm', style: heatStyle(GRAY) })
      cur = Math.max(cur, e)
    }
    if (cur < text.length) gaps.push({ start: cur, end: text.length, cls: 'hm', style: heatStyle(GRAY) })
    marks.push(...gaps)
  } else {
    const chunks = buildChunks(text, tokens, settings.chunkMode)
    for (const c of chunks) {
      const hoverCls = hoverKey === `c${c.start}-${c.end}` ? ' hm-hover' : ''
      if (c.ignored) {
        addMark(c.start, c.end, 'hm hm-ignored' + hoverCls, ignoredStyle())
      } else if (!c.stat) {
        addMark(c.start, c.end, 'hm' + hoverCls, heatStyle(GRAY))
      } else {
        addMark(c.start, c.end, 'hm' + hoverCls, heatStyle(colorForPpl(c.stat.ppl, settings.stops)))
      }
    }
  }

  // RangeSetBuilder 要求严格递增且不重叠
  marks.sort((a, b) => a.start - b.start || a.end - b.end)
  const ranges = []
  let lastEnd = -1
  for (const m of marks) {
    if (m.start < lastEnd) continue
    ranges.push(Decoration.mark({ class: m.cls, attributes: { style: m.style } }).range(m.start, m.end))
    lastEnd = m.end
  }
  return Decoration.set(ranges)
}

// ---------- 热力图 StateField ----------
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

// ---------- 提示框 ----------
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
  if (!stat) return '<span class="tip-dim">未测量（或无有效 Token）</span>'
  return (
    `平均 PPL <b>${stat.ppl < 1000 ? stat.ppl.toPrecision(3) : stat.ppl.toExponential(2)}</b>` +
    ` · NLL ${stat.nll.toFixed(3)}` +
    `<span class="tip-dim">（${stat.count} 个有效 Token）</span>`
  )
}

/** 查询某文档位置在当前分块模式下的统计信息 */
function infoAtPos(state: EditorState, pos: number): { key: string; label: string; stat: StatResult | null } | null {
  const { tokens, ignores } = state.field(hmField)
  const text = state.doc.toString()
  if (!text) return null
  markIgnored(tokens, ignores)
  if (settings.chunkMode === 'token') {
    const t = tokens.find((t) => (t.end > t.start ? t.start <= pos && pos < t.end : t.start === pos))
    if (!t) return null
    const suffix = t.ignored ? '（已忽略）' : t.stale ? '（已失效）' : ''
    const stat = t.ignored || t.stale || t.nll == null || t.ppl == null
      ? null
      : { nll: t.nll, ppl: t.ppl, count: 1 }
    return { key: `t${t.tokenIndex}`, label: `Token #${t.tokenIndex}「${t.text}」${suffix}`, stat }
  }
  const chunks = buildChunks(text, tokens, settings.chunkMode)
  const c = chunks.find((c) => c.start <= pos && pos < c.end)
  if (!c) return null
  const name = settings.chunkMode === 'sentence' ? '句子' : '段落'
  return {
    key: `c${c.start}-${c.end}`,
    label: name + (c.ignored ? '（已忽略）' : ''),
    stat: c.ignored ? null : c.stat
  }
}

/** 悬停插件：mousemove 定位分块 → 突出显示 + 弹出 PPL 提示 */
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
    // 文档/配置变化后重新校验当前悬停位置。
    // 更新周期内不允许同步 dispatch，延迟到周期外执行。
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
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos == null) {
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

// ---------- 对外接口 ----------
export interface EditorCallbacks {
  onDocChanged: (update: ViewUpdate) => void
  onSelectionChanged: (update: ViewUpdate) => void
  onAnalyze: () => void
}

export interface EditorApi {
  view: EditorView
  /** 分析结果落地：把后端 token_details 转换为内部 token（UTF-16 下标）并刷新装饰 */
  applyAnalysis: (data: PplResponse, cpMap: number[]) => void
  /** 配置变化后重建装饰（颜色/样式/分块模式/分层窗口等） */
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
    const html = `<div class="tip-label">选区（${sel.to - sel.from} 字符）</div>${statHtml(stat)}`
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

    /** 分析结果落地：把后端 token_details 转换为内部 token（UTF-16 下标）并刷新装饰 */
    applyAnalysis(data, cpMap) {
      const tokens: Token[] = []
      for (const d of data.token_details) {
        let start: number | null = d.char_start == null ? null : cpMap[d.char_start]
        let end: number | null = d.char_end == null ? null : cpMap[d.char_end]
        if (start == null || end == null) {
          // 无法对齐的 token：零宽，挂在前一个 token 末尾
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