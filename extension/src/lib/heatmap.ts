// ---------- Heat-map renderer: per-char colors, inline styles only ----------
// Renders color segments as <span class="ppl-tok"> whose styles are fully
// inline (the class is a marker for cleanup, nothing styles it). The ppl ->
// color math is core's `colorForPpl`/`smoothTokens` — the canonical contract.
import { colorForPpl, rgba, smoothTokens, type ColorStop, type SmoothToken } from '@opengptdetect/core'
import type { ExtensionSettings } from './settings.ts'
import type { FlatText, MeasurementUnit } from './dom-scan.ts'

interface HeatToken extends SmoothToken {
  /** Local [a, b) char range inside the block's flat text. */
  a: number
  b: number
}

/**
 * Paint one block. `unitTokens` are the merged tokens of the whole unit with
 * char offsets relative to the unit text; `blockOffset` maps into block-local
 * coordinates. `stops` come from the profile bound to the block language.
 */
export function renderBlock(
  blockEl: HTMLElement,
  flat: FlatText,
  unitTokens: (SmoothToken & { char_start: number; char_end: number })[],
  blockOffset: number,
  blockLen: number,
  settings: ExtensionSettings,
  stops: ColorStop[],
): void {
  if (!settings.heatmapEnabled) return

  // Tokens that intersect this block, in local coordinates.
  const local: HeatToken[] = []
  for (const t of unitTokens) {
    const a = Math.max(0, t.char_start - blockOffset)
    const b = Math.min(blockLen, t.char_end - blockOffset)
    if (a < b) local.push({ ppl: t.ppl, text: t.text, a, b })
  }
  if (!local.length) return

  const smoothed = smoothTokens(local, settings.smoothingMode, settings.smoothingWindowSize)

  // Per-char color array (null = not painted).
  const chars: (string | null)[] = new Array(blockLen).fill(null)
  for (let i = 0; i < local.length; i++) {
    const ppl = smoothed[i]
    if (ppl == null) continue
    const tok = local[i]!
    const color = rgba(colorForPpl(ppl, stops), settings.heatmapOpacity)
    for (let c = tok.a; c < tok.b; c++) chars[c] = color
  }

  wrapRanges(blockEl, chars, flat.nodes, settings.heatmapStyle)
}

function wrapRanges(
  blockEl: HTMLElement,
  chars: (string | null)[],
  nodes: FlatText['nodes'],
  style: ExtensionSettings['heatmapStyle'],
): void {
  for (const nd of nodes) {
    if (nd.end <= nd.start) continue
    const segStart = Math.max(0, nd.start)
    const segEnd = Math.min(chars.length, nd.end)
    if (segStart >= segEnd) continue

    // Split the node into same-color segments; rawMap converts flat indices
    // back to raw offsets inside the original text node.
    const segments: { color: string | null; rawStart: number; rawEnd: number }[] = []
    let i = segStart
    while (i < segEnd) {
      const col = chars[i] ?? null
      let j = i + 1
      while (j < segEnd && (chars[j] ?? null) === col) j++
      const localStart = i - nd.start
      const localEnd = j - nd.start
      const rawStart = nd.rawMap[localStart] ?? 0
      const rawEnd = localEnd < nd.rawMap.length ? nd.rawMap[localEnd]! : (nd.node.nodeValue ?? '').length
      segments.push({ color: col, rawStart, rawEnd })
      i = j
    }
    if (!segments.length) continue

    const frag = document.createDocumentFragment()
    const raw = nd.node.nodeValue ?? ''
    for (const seg of segments) {
      const text = raw.slice(seg.rawStart, seg.rawEnd)
      if (seg.color == null) {
        frag.appendChild(document.createTextNode(text))
      } else {
        const span = document.createElement('span')
        span.className = 'ppl-tok'
        span.textContent = text
        if (style === 'underline') {
          span.style.textDecoration = 'underline'
          span.style.textDecorationColor = seg.color
          span.style.textUnderlineOffset = '2px'
        } else if (style === 'bottombar') {
          span.style.borderBottom = `2px solid ${seg.color}`
        } else {
          span.style.backgroundColor = seg.color
          span.style.borderRadius = '2px'
          ;(span.style as CSSStyleDeclaration & { WebkitBoxDecorationBreak?: string }).WebkitBoxDecorationBreak =
            'clone'
          span.style.boxDecorationBreak = 'clone'
        }
        frag.appendChild(span)
      }
    }
    nd.node.parentNode?.replaceChild(frag, nd.node)
  }
}
