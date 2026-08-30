// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest'

// jsdom's getBoundingClientRect is always 0x0, which isHidden() would read as
// "hidden" — stub it so scanning works like in a real browser (same as
// dom-scan.test.ts).
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
import {
  ADAPTER_REGISTRY,
  GENERIC_ADAPTER,
  extractBlocksFor,
  matchAdapterUrl,
  type SiteAdapter,
} from '../src/lib/adapters.ts'
import { DEFAULT_SETTINGS } from '../src/lib/settings.ts'
import { scan, type ScannedBlock } from '../src/lib/dom-scan.ts'

function makeParagraph(text: string): HTMLElement {
  const p = document.createElement('p')
  p.textContent = text
  return p
}

function makeBody(paragraphs: string[]): HTMLElement {
  const body = document.body
  body.innerHTML = ''
  for (const t of paragraphs) body.appendChild(makeParagraph(t))
  return body
}

const SETTINGS = { ...DEFAULT_SETTINGS, minParagraphChars: 5 }

let originalRegistry: SiteAdapter[]

beforeEach(() => {
  document.body.innerHTML = ''
  originalRegistry = [...ADAPTER_REGISTRY]
  // Reset the registry to generic-only between tests.
  ADAPTER_REGISTRY.splice(0, ADAPTER_REGISTRY.length, GENERIC_ADAPTER)
})

afterEach(() => {
  ADAPTER_REGISTRY.splice(0, ADAPTER_REGISTRY.length, ...originalRegistry)
})

describe('adapter registry matching', () => {
  it('generic matches any URL', () => {
    expect(matchAdapterUrl('https://www.zhihu.com/question/1').id).toBe('generic')
    expect(ADAPTER_REGISTRY[0]!.matches(new URL('https://example.com/a'))).toBe(true)
  })

  it('first matching adapter wins (site-specific before generic)', () => {
    const zhihu: SiteAdapter = { id: 'zhihu', matches: (u) => u.host === 'www.zhihu.com' }
    ADAPTER_REGISTRY.unshift(zhihu)
    expect(matchAdapterUrl('https://www.zhihu.com/question/1').id).toBe('zhihu')
    expect(matchAdapterUrl('https://example.com/').id).toBe('generic')
  })

  it('returns undefined for an invalid URL', () => {
    expect(matchAdapterUrl('not a url')).toBeUndefined()
  })
})

describe('extractBlocks (adapter-driven extraction)', () => {
  it('falls back to the generic scanner when no adapter extracts', () => {
    const body = makeBody(['hello world here'])
    const fromAdapter = extractBlocksFor('https://example.com/', body, SETTINGS)
    const fromGeneric = scan(body, SETTINGS)
    expect(fromAdapter.map((b) => b.text)).toEqual(fromGeneric.map((b) => b.text))
  })

  it('uses the matched adapter result and applies its exclude filter', () => {
    const card: SiteAdapter = {
      id: 'cards',
      matches: () => true,
      extract: (): ScannedBlock[] => [
        { el: document.querySelectorAll('p')[0]!, text: 'sample text' },
      ],
      exclude: (el, url) => url.pathname === '/blocked' && el.tagName === 'P',
    }
    ADAPTER_REGISTRY.unshift(card)
    makeBody(['hello world here'])

    // Normal path: adapter result passes through.
    let blocks = extractBlocksFor('https://cards.example/ok', document.body, SETTINGS)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.text).toBe('sample text')

    // Blocked path: exclude() filters the adapter result out.
    blocks = extractBlocksFor('https://cards.example/blocked', document.body, SETTINGS)
    expect(blocks).toHaveLength(0)
  })

  it('falls back to the generic scanner when the adapter throws', () => {
    const bomb: SiteAdapter = {
      id: 'bomb',
      matches: () => true,
      extract: () => {
        throw new Error('boom')
      },
    }
    ADAPTER_REGISTRY.unshift(bomb)
    const body = makeBody(['hello world here'])
    const blocks = extractBlocksFor('https://bomb.example/', body, SETTINGS)
    expect(blocks.map((b) => b.text)).toEqual(['hello world here'])
  })
})
