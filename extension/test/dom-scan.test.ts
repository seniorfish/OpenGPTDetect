// @vitest-environment jsdom
import { beforeAll, describe, it, expect } from 'vitest'
import { BUILTIN_PROFILES } from '@opengptdetect/core'
import { DEFAULT_SETTINGS } from '../src/lib/settings.ts'
import {
  scan,
  groupUnits,
  getFlatText,
  setState,
  type ScanOptions,
  type ScannedBlock,
} from '../src/lib/dom-scan.ts'
import { renderBlock } from '../src/lib/heatmap.ts'

// jsdom's getBoundingClientRect is always 0x0, which `isHidden()` would read as
// "hidden" — stub it so scanning works like in a real browser.
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  })
})

const settings = (patch: Partial<typeof DEFAULT_SETTINGS> = {}): typeof DEFAULT_SETTINGS => ({
  ...DEFAULT_SETTINGS,
  ...patch,
})

/** scan() now takes the default adapter's own config, not global settings. */
const opts = (p: Partial<ScanOptions> = {}): ScanOptions => ({
  textBlockMode: 'article',
  minParagraphChars: 1,
  maxBlocksPerPage: 2000,
  ...p,
})

describe('dom-scan', () => {
  it('scans blocks, skips hidden/script, keeps document order', () => {
    document.body.innerHTML =
      '<p id="a">Hello world, 这是一个测试段落！</p>' +
      '<p id="b" hidden>skip me</p>' +
      '<script>const x = 1;</script>' +
      '<p id="c">third</p>'
    const blocks = scan(document.body, opts())
    expect(blocks.map((b) => b.el.id)).toEqual(['a', 'c'])
    expect(blocks[0]!.text).toBe('Hello world, 这是一个测试段落！')
  })

  it('compresses whitespace and records raw offsets', () => {
    document.body.innerHTML = '<p>a  b\tc</p>'
    const flat = getFlatText(document.querySelector('p')!)
    expect(flat.text).toBe('a b c')
    // raw = 'a  b\tc': the FIRST whitespace of each run is kept (space run -> 1,
    // the standalone tab starts its own run -> 4).
    expect(flat.nodes[0]!.rawMap).toEqual([0, 1, 3, 4, 5])
  })

  it('skips done/measuring/error blocks; remeasure (pending) re-includes them', () => {
    document.body.innerHTML =
      '<p id="a">alpha beta</p><p id="b">gamma delta</p><p id="c">epsilon zeta</p>'
    setState(document.getElementById('a')!, 'done')
    setState(document.getElementById('b')!, 'measuring')
    setState(document.getElementById('c')!, 'error')
    expect(scan(document.body, opts())).toEqual([])
    // The explicit remeasure path resets the state to 'pending' -> candidate.
    setState(document.getElementById('c')!, 'pending')
    expect(scan(document.body, opts()).map((b) => b.el.id)).toEqual(['c'])
  })

  it('groups adjacent short paragraphs into one unit', () => {
    document.body.innerHTML =
      '<p id="a">short one</p><p id="b">short two</p><p id="c">a long paragraph here</p>'
    // gap = 10: 'short one'/'short two' (9 chars) merge; 'a long...' (22) does not.
    const units = groupUnits(
      scan(document.body, opts()),
      settings({ mergeMaxGapChars: 10 }),
    )
    expect(units).toHaveLength(2)
    expect(units[0]!.blocks.map((b) => b.el.id)).toEqual(['a', 'b'])
    expect(units[0]!.text).toBe('short one\nshort two')
    expect(units[1]!.blocks[0]!.el.id).toBe('c')
  })
})

describe('unitBoundary merging (site adapters keep articles apart)', () => {
  // Same block texts as the merge test: 'a','b' short (<=10), 'c' long.
  const blocks = (): ScannedBlock[] => [
    { el: makeEl(), text: 'short one', unitBoundary: 'before' },
    { el: makeEl(), text: 'short two', unitBoundary: 'after' },
    { el: makeEl(), text: 'a long paragraph here' },
  ]
  const makeEl = (): HTMLElement => document.createElement('p')
  const s = settings({ minParagraphChars: 1, mergeMaxGapChars: 10 })

  it("'before' starts a new unit (never merges into the previous one)", () => {
    // 'b' gets the boundary when it is its own article start.
    const bs = [
      { el: makeEl(), text: 'short one' },
      { el: makeEl(), text: 'short two', unitBoundary: 'before' as const },
    ]
    const units = groupUnits(bs, s)
    expect(units).toHaveLength(2)
    expect(units[0]!.text).toBe('short one')
    expect(units[1]!.text).toBe('short two')
  })

  it("'after' closes the unit after this block (same article may still merge up to it)", () => {
    const units = groupUnits(blocks(), s)
    // a+b merge (short), then 'after' closes the pair; c starts its own unit.
    expect(units).toHaveLength(2)
    expect(units[0]!.text).toBe('short one\nshort two')
    expect(units[1]!.text).toBe('a long paragraph here')
  })

  it("'both' makes a block its own unit", () => {
    const bs = [
      { el: makeEl(), text: 'short one', unitBoundary: 'both' as const },
      { el: makeEl(), text: 'short two' },
    ]
    const units = groupUnits(bs, s)
    expect(units).toHaveLength(2)
    expect(units[0]!.text).toBe('short one')
    expect(units[1]!.text).toBe('short two')
  })

  it('no boundary keeps the original merging behaviour', () => {
    const bs = [
      { el: makeEl(), text: 'short one' },
      { el: makeEl(), text: 'short two' },
    ]
    expect(groupUnits(bs, s)).toHaveLength(1)
  })
})

describe('heatmap renderBlock (inline styles only)', () => {
  it('paints spans with inline background colors and marker class', () => {
    document.body.innerHTML = '<p id="target">Hello world</p>'
    const el = document.querySelector('p')!
    const flat = getFlatText(el)
    const stops = BUILTIN_PROFILES[0]!.scale.stops
    const tokens = [
      { ppl: 12, text: 'Hello', char_start: 0, char_end: 5 },
      { ppl: 50, text: ' world', char_start: 5, char_end: 11 },
    ]
    renderBlock(el, flat, tokens, 0, 11, settings({ heatmapEnabled: true }), stops)
    const spans = el.querySelectorAll('span.ppl-tok')
    expect(spans.length).toBeGreaterThan(0)
    expect(spans[0]!.style.backgroundColor).toContain('rgba(')
    // The marker class must not carry any styling (zero-CSS-injection rule).
    expect(spans[0]!.className).toBe('ppl-tok')
  })

  it('does nothing when heatmap is disabled', () => {
    document.body.innerHTML = '<p>Hello world</p>'
    const el = document.querySelector('p')!
    const flat = getFlatText(el)
    const stops = BUILTIN_PROFILES[0]!.scale.stops
    const tokens = [{ ppl: 12, text: 'Hello', char_start: 0, char_end: 5 }]
    renderBlock(el, flat, tokens, 0, 5, settings({ heatmapEnabled: false }), stops)
    expect(el.querySelectorAll('span.ppl-tok').length).toBe(0)
  })
})
