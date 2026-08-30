// ---------- Text-block detection & flat-text extraction (typed) ----------
// Same heuristics as the legacy content script: article-style block tags,
// hidden/editable exclusions, whitespace-compressed flat text with a
// character -> (text node, raw offset) map used by the heat-map renderer.
import type { ExtensionSettings } from './settings.ts'

export const STATE_ATTR = 'data-ppl-state'

const BLOCK_TAGS = new Set([
  'P',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'DD',
  'DT',
  'FIGCAPTION',
  'TD',
  'TH',
  'CAPTION',
])
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'IFRAME',
  'OBJECT',
  'SVG',
  'CANVAS',
  'BUTTON',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'NAV',
  'HEADER',
  'FOOTER',
  'ASIDE',
])

export interface ScannedBlock {
  el: HTMLElement
  text: string
  /**
   * Unit boundary for the measurement-unit merger (site adapters use this to
   * keep neighbouring articles apart):
   * - 'before': never merge this block into the previous unit (start a new one);
   * - 'after': close the current unit right after this block;
   * - 'both': this block is its own unit.
   * Generic scanning blocks carry no boundary -> unchanged merging behaviour.
   */
  unitBoundary?: 'before' | 'after' | 'both'
}

export interface FlatNode {
  node: Text
  start: number
  end: number
  /** Compact-index -> raw offset inside node.nodeValue. */
  rawMap: number[]
}

export interface FlatText {
  text: string
  nodes: FlatNode[]
}

export interface UnitBlock {
  el: HTMLElement
  text: string
}

export interface MeasurementUnit {
  blocks: UnitBlock[]
  text: string
  offsets: { start: number; end: number }[]
}

function isHidden(el: Element): boolean {
  const cs = getComputedStyle(el)
  if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0)
    return true
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return true
  return false
}

function shouldSkip(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true
  if ((el as HTMLElement).isContentEditable) return true
  if (el.getAttribute('role') === 'navigation') return true
  if (el.closest('[contenteditable=true]')) return true
  return false
}

function directTextLength(el: Element): number {
  let n = 0
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === Node.TEXT_NODE) n += (c.nodeValue ?? '').trim().length
  }
  return n
}

function isCandidate(el: Element, mode: string): boolean {
  if (isHidden(el) || shouldSkip(el)) return false
  if (BLOCK_TAGS.has(el.tagName)) return true
  if (
    mode === 'all' &&
    (el.tagName === 'DIV' || el.tagName === 'SPAN' || el.tagName === 'SECTION')
  ) {
    return directTextLength(el) >= 4
  }
  return false
}

/** Flatten text nodes under `el`, compressing runs of whitespace to one space. */
export function getFlatText(el: Element): FlatText {
  const parts: string[] = []
  const nodes: FlatNode[] = []
  let pos = 0
  let lastWasSpace = false
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentNode as Element | null
      if (!p) return NodeFilter.FILTER_REJECT
      if (p.tagName === 'SCRIPT' || p.tagName === 'STYLE' || p.tagName === 'NOSCRIPT') {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let n = walker.nextNode() as Text | null
  while (n) {
    const raw = n.nodeValue ?? ''
    if (raw.length) {
      let local = ''
      const rawMap: number[] = []
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i]!
        if (/\s/.test(ch)) {
          if (!lastWasSpace) {
            local += ' '
            rawMap.push(i)
            lastWasSpace = true
          }
        } else {
          local += ch
          rawMap.push(i)
          lastWasSpace = false
        }
      }
      if (local.length) {
        nodes.push({ node: n, start: pos, end: pos + local.length, rawMap })
        parts.push(local)
        pos += local.length
      }
    }
    n = walker.nextNode() as Text | null
  }
  return { text: parts.join(''), nodes }
}

export function charCount(text: string): number {
  return text.length
}

export function wordCount(text: string): number {
  const m = text.match(/\S+/g)
  return m ? m.length : 0
}

/** Scan the tree under `root` for candidate blocks (document order, deduped). */
export function scan(root: Element, settings: ExtensionSettings): ScannedBlock[] {
  const mode = settings.textBlockMode
  const minChars = settings.minParagraphChars
  const maxBlocks = settings.maxBlocksPerPage
  const out: ScannedBlock[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const el = node as Element
      if (shouldSkip(el)) return NodeFilter.FILTER_REJECT
      if (isCandidate(el, mode)) return NodeFilter.FILTER_ACCEPT
      return NodeFilter.FILTER_SKIP
    },
  })
  let n = 0
  let cur = walker.nextNode() as Element | null
  while (cur && n < maxBlocks) {
    const state = cur.getAttribute(STATE_ATTR)
    if (state !== 'done' && state !== 'measuring') {
      const text = getFlatText(cur).text
      if (charCount(text) >= Math.max(1, minChars)) {
        out.push({ el: cur as HTMLElement, text })
        n++
      } else {
        cur.setAttribute(STATE_ATTR, 'skipped')
      }
    }
    cur = walker.nextNode() as Element | null
  }
  return out
}

/** Group adjacent short blocks into one measurement unit. */
export function groupUnits(
  candidates: ScannedBlock[],
  settings: ExtensionSettings,
): MeasurementUnit[] {
  if (!settings.mergeAdjacentShortParagraphs) {
    return candidates.map((c) => ({
      blocks: [{ el: c.el, text: c.text }],
      text: c.text,
      offsets: [{ start: 0, end: c.text.length }],
    }))
  }
  const gap = settings.mergeMaxGapChars
  const units: MeasurementUnit[] = []
  let cur: MeasurementUnit | null = null

  for (const c of candidates) {
    const boundaryBefore = c.unitBoundary === 'before' || c.unitBoundary === 'both'
    const boundaryAfter = c.unitBoundary === 'after' || c.unitBoundary === 'both'
    if (boundaryBefore) {
      if (cur) units.push(cur)
      cur = null
    }
    const short = c.text.length <= gap
    if (cur && short && cur.text.length + c.text.length + 1 <= settings.maxCharsPerRequest) {
      const start = cur.text.length + 1
      cur.text = cur.text + '\n' + c.text
      cur.blocks.push({ el: c.el, text: c.text })
      cur.offsets.push({ start, end: cur.text.length })
    } else {
      if (cur) units.push(cur)
      cur = {
        blocks: [{ el: c.el, text: c.text }],
        text: c.text,
        offsets: [{ start: 0, end: c.text.length }],
      }
    }
    if (boundaryAfter) {
      if (cur) units.push(cur)
      cur = null
    }
  }
  if (cur) units.push(cur)
  return units
}

export function setState(el: Element, state: string): void {
  el.setAttribute(STATE_ATTR, state)
}

export function getState(el: Element): string | null {
  return el.getAttribute(STATE_ATTR)
}
