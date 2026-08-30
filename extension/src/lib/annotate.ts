// ---------- Inline-styled annotations (zero CSS injection) ----------
// Everything the annotation layer paints is inline style; the class names below
// are MARKERS ONLY (never styled by any CSS) so removal is a single query.
import type { ExtensionSettings } from './settings.ts'

export const LABEL_CLASS = 'ppl-label'
export const AI_TAG_CLASS = 'ppl-ai-tag'
export const LOADING_CLASS = 'ppl-loading'
export const ERROR_CLASS = 'ppl-error-tag'
export const AI_CLASS = 'ppl-ai'

const LABEL_COLOR = '#6b7280'

/** Original inline values of an element before we touched its left border. */
const aiBorderPrev = new WeakMap<HTMLElement, { borderLeft: string; paddingLeft: string }>()

function removeByClass(el: Element, cls: string): void {
  for (const n of el.querySelectorAll('.' + cls)) n.remove()
}

export function clearAll(blockEl: HTMLElement): void {
  removeByClass(blockEl, LABEL_CLASS)
  removeByClass(blockEl, AI_TAG_CLASS)
  removeByClass(blockEl, LOADING_CLASS)
  removeByClass(blockEl, ERROR_CLASS)
  clearAI(blockEl)
}

/** Apply the AI left border (records the original inline values once). */
export function setAI(blockEl: HTMLElement, settings: ExtensionSettings): void {
  if (!aiBorderPrev.has(blockEl)) {
    aiBorderPrev.set(blockEl, {
      borderLeft: blockEl.style.borderLeft,
      paddingLeft: blockEl.style.paddingLeft
    })
  }
  blockEl.style.borderLeft = `3px solid ${settings.aiBorderColor}`
  blockEl.style.paddingLeft = '6px'
  blockEl.classList.add(AI_CLASS)
}

/** Restore the original inline values (also used when the extension is disabled). */
export function clearAI(blockEl: HTMLElement): void {
  const prev = aiBorderPrev.get(blockEl)
  if (prev) {
    blockEl.style.borderLeft = prev.borderLeft
    blockEl.style.paddingLeft = prev.paddingLeft
  }
  blockEl.classList.remove(AI_CLASS)
}

export function hasAI(blockEl: HTMLElement): boolean {
  return aiBorderPrev.has(blockEl)
}

/** Small "ppl 12.3" superscript label at the end of a block. */
export function addLabel(blockEl: HTMLElement, avgPpl: number, lang: string, settings: ExtensionSettings): void {
  if (!settings.showPplLabel) return
  if (!Number.isFinite(avgPpl)) return
  removeByClass(blockEl, LABEL_CLASS)
  const span = document.createElement('span')
  span.className = LABEL_CLASS
  span.textContent = `ppl ${avgPpl.toFixed(1)}`
  span.title = `平均困惑度 ${avgPpl.toFixed(2)}(${lang === 'en' ? '英文' : '中文'}段)`
  span.style.display = 'inline-block'
  span.style.fontSize = '0.72em'
  span.style.lineHeight = '1'
  span.style.color = LABEL_COLOR
  span.style.marginLeft = '0.4em'
  span.style.verticalAlign = 'super'
  span.style.opacity = '0.85'
  span.style.userSelect = 'none'
  span.style.whiteSpace = 'nowrap'
  span.style.fontVariantNumeric = 'tabular-nums'
  blockEl.appendChild(span)
}

/** AI verdict: left border (restorable) + optional tag. */
export function markAI(blockEl: HTMLElement, settings: ExtensionSettings): void {
  if (settings.aiBorderEnabled) setAI(blockEl, settings)
  if (settings.aiTagEnabled) {
    removeByClass(blockEl, AI_TAG_CLASS)
    const tag = document.createElement('span')
    tag.className = AI_TAG_CLASS
    tag.textContent = 'AI?'
    tag.style.display = 'inline-block'
    tag.style.fontSize = '0.68em'
    tag.style.lineHeight = '1'
    tag.style.color = '#fff'
    tag.style.backgroundColor = settings.aiBorderColor
    tag.style.borderRadius = '3px'
    tag.style.padding = '1px 4px'
    tag.style.marginLeft = '0.4em'
    tag.style.verticalAlign = 'super'
    tag.style.opacity = '0.9'
    tag.style.userSelect = 'none'
    tag.style.whiteSpace = 'nowrap'
    blockEl.appendChild(tag)
  }
}

/**
 * Inline-served visual note while a block is measured.
 * Note: the legacy "spinner" (CSS keyframes) cannot be pure-inline; both modes
 * render a static glyph (⏳ / ◌) — a small, documented behaviour change.
 */
export function addLoading(blockEl: HTMLElement, settings: ExtensionSettings): void {
  if (settings.loadingIndicator === 'none') return
  removeByClass(blockEl, LOADING_CLASS)
  const span = document.createElement('span')
  span.className = LOADING_CLASS
  span.textContent = settings.loadingIndicator === 'spinner' ? '◌' : '⏳'
  span.style.display = 'inline-block'
  span.style.fontSize = '0.7em'
  span.style.marginLeft = '0.4em'
  span.style.verticalAlign = 'super'
  span.style.opacity = '0.6'
  blockEl.appendChild(span)
}

export function removeLoading(blockEl: HTMLElement): void {
  removeByClass(blockEl, LOADING_CLASS)
}

export function addError(blockEl: HTMLElement): void {
  removeByClass(blockEl, ERROR_CLASS)
  const span = document.createElement('span')
  span.className = ERROR_CLASS
  span.textContent = 'ppl测量失败'
  span.title = '本地模型服务返回错误或超时'
  span.style.display = 'inline-block'
  span.style.fontSize = '0.68em'
  span.style.color = '#dc2626'
  span.style.marginLeft = '0.4em'
  span.style.verticalAlign = 'super'
  span.style.opacity = '0.8'
  span.style.userSelect = 'none'
  blockEl.appendChild(span)
}
