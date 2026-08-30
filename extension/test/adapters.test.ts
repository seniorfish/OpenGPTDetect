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
  DEFAULT_ADAPTER,
  extractBlocksFor,
  matchAdapterUrl,
  type SiteAdapter,
} from '../src/lib/adapters/index.ts'
import { DEFAULT_SETTINGS } from '../src/lib/settings.ts'
import { scan, type ScannedBlock } from '../src/lib/dom-scan.ts'

function makeBody(paragraphs: string[]): HTMLElement {
  document.body.innerHTML = ''
  for (const t of paragraphs) document.body.appendChild(makeParagraph(t))
  return document.body
}

function makeParagraph(text: string): HTMLElement {
  const p = document.createElement('p')
  p.textContent = text
  return p
}

const SETTINGS = { ...DEFAULT_SETTINGS, minParagraphChars: 5 }

let originalRegistry: SiteAdapter[]

beforeEach(() => {
  document.body.innerHTML = ''
  originalRegistry = [...ADAPTER_REGISTRY]
  // Reset the registry to default-only between tests.
  ADAPTER_REGISTRY.splice(0, ADAPTER_REGISTRY.length, DEFAULT_ADAPTER)
})

afterEach(() => {
  ADAPTER_REGISTRY.splice(0, ADAPTER_REGISTRY.length, ...originalRegistry)
})

describe('adapter registry matching', () => {
  it('the default adapter matches any URL and is symmetric with site adapters', () => {
    expect(matchAdapterUrl('https://www.zhihu.com/question/1')?.id).toBe('default')
    expect(DEFAULT_ADAPTER.id).toBe('default')
    expect(DEFAULT_ADAPTER.extract).toBeTypeOf('function') // same shape as any site adapter
    expect(DEFAULT_ADAPTER.matches(new URL('https://example.com/a'))).toBe(true)
  })

  it('first matching adapter wins (site-specific before default)', () => {
    const zhihu: SiteAdapter = {
      id: 'zhihu',
      matches: (u) => u.host === 'www.zhihu.com',
      extract: () => [],
    }
    ADAPTER_REGISTRY.unshift(zhihu)
    expect(matchAdapterUrl('https://www.zhihu.com/question/1')?.id).toBe('zhihu')
    expect(matchAdapterUrl('https://example.com/')?.id).toBe('default')
  })

  it('returns undefined for an invalid URL', () => {
    expect(matchAdapterUrl('not a url')).toBeUndefined()
  })
})

describe('extractBlocksFor (adapter-driven extraction)', () => {
  it('the default adapter produces the generic scan blocks', () => {
    const body = makeBody(['hello world here'])
    const blocks = extractBlocksFor('https://example.com/', body, SETTINGS)
    expect(blocks.map((b) => b.text)).toEqual(scan(body, SETTINGS).map((b) => b.text))
  })

  it('uses the site adapter result when it produces blocks', () => {
    const card: SiteAdapter = {
      id: 'cards',
      matches: () => true,
      extract: (): ScannedBlock[] => [
        { el: document.querySelectorAll('p')[0]!, text: 'sample text' },
      ],
    }
    ADAPTER_REGISTRY.unshift(card)
    makeBody(['hello world here'])
    const blocks = extractBlocksFor('https://cards.example/', document.body, SETTINGS)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.text).toBe('sample text')
  })

  it('deferring to the default still applies the site adapter exclude filter', () => {
    const filter: SiteAdapter = {
      id: 'filter',
      matches: () => true,
      extract: () => null, // no site-specific extraction; use the generic scanner
      exclude: (el) => el.textContent === 'noise paragraph',
    }
    ADAPTER_REGISTRY.unshift(filter)
    makeBody(['hello world here', 'noise paragraph'])
    const blocks = extractBlocksFor('https://filter.example/', document.body, SETTINGS)
    expect(blocks.map((b) => b.text)).toEqual(['hello world here'])
  })

  it('exclude applies on top of site-adapter results', () => {
    const card: SiteAdapter = {
      id: 'cards',
      matches: () => true,
      extract: (): ScannedBlock[] => [
        { el: document.querySelectorAll('p')[0]!, text: 'sample text' },
      ],
      exclude: (el, url) => url.pathname === '/blocked',
    }
    ADAPTER_REGISTRY.unshift(card)
    makeBody(['hello world here'])
    expect(extractBlocksFor('https://cards.example/ok', document.body, SETTINGS)).toHaveLength(1)
    expect(extractBlocksFor('https://cards.example/blocked', document.body, SETTINGS)).toHaveLength(
      0,
    )
  })

  it('falls back to the default adapter when the site adapter throws', () => {
    const bomb: SiteAdapter = {
      id: 'bomb',
      matches: () => true,
      extract: () => {
        throw new Error('boom')
      },
    }
    ADAPTER_REGISTRY.unshift(bomb)
    const body = makeBody(['hello world here'])
    expect(extractBlocksFor('https://bomb.example/', body, SETTINGS).map((b) => b.text)).toEqual([
      'hello world here',
    ])
  })

  it('passes the URL through to site adapter extract (section branching)', () => {
    let seenUrl = ''
    const section: SiteAdapter = {
      id: 'section',
      matches: () => true,
      extract: ({ url }) => {
        seenUrl = url.pathname
        return null
      },
    }
    ADAPTER_REGISTRY.unshift(section)
    extractBlocksFor('https://zhihu.example/p/123', document.body, SETTINGS)
    expect(seenUrl).toBe('/p/123')
  })
})
