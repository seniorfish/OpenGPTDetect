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
  DEFAULT_ADAPTER_PRIORITY,
  adapterMatches,
  adapterRuntimeConfig,
  effectiveRegistry,
  extractBlocksFor,
  matchAdapterUrl,
  type AdapterConfigField,
  type AdapterRuntimeConfig,
  type SiteAdapter,
} from '../src/lib/adapters/index.ts'
import { DEFAULT_SETTINGS, type ExtensionSettings } from '../src/lib/settings.ts'
import { scan, type ScanOptions, type ScannedBlock } from '../src/lib/dom-scan.ts'

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

const SETTINGS: ExtensionSettings = {
  ...DEFAULT_SETTINGS,
  adapters: { default: { config: { minParagraphChars: 5 } } },
}

const SCAN_OPTS: ScanOptions = {
  textBlockMode: 'article',
  minParagraphChars: 5,
  maxBlocksPerPage: 2000,
}

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
    expect(blocks.map((b) => b.text)).toEqual(scan(body, SCAN_OPTS).map((b) => b.text))
  })

  it("the default adapter's own config drives the generic scan", () => {
    makeBody(['hello world here']) // 16 chars
    const strict: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      adapters: { default: { config: { minParagraphChars: 100 } } },
    }
    expect(extractBlocksFor('https://example.com/', document.body, strict)).toHaveLength(0)
    expect(extractBlocksFor('https://example.com/', document.body, SETTINGS)).toHaveLength(1)
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

  it('resolves ctx.config from configFields defaults and stored overrides', () => {
    const seen: AdapterRuntimeConfig[] = []
    const probe: SiteAdapter = {
      id: 'probe',
      matches: () => true,
      configFields: [
        { key: 'includeComments', kind: 'boolean', default: true, label: { zh: 'x', en: 'x' } },
      ],
      extract: (ctx) => {
        seen.push(ctx.config)
        return null
      },
    }
    ADAPTER_REGISTRY.unshift(probe)
    makeBody(['hello world here'])
    extractBlocksFor('https://probe.example/', document.body, SETTINGS)
    expect(seen[0]).toEqual({ includeComments: true }) // declared default
    const overridden: ExtensionSettings = {
      ...SETTINGS,
      adapters: { ...SETTINGS.adapters, probe: { config: { includeComments: false } } },
    }
    extractBlocksFor('https://probe.example/', document.body, overridden)
    expect(seen[1]).toEqual({ includeComments: false }) // stored override
  })
})

describe('per-adapter settings (enabled / priority / url overrides)', () => {
  const zhihu: SiteAdapter = {
    id: 'zhihu',
    matches: (u) => u.host === 'www.zhihu.com',
    extract: (): ScannedBlock[] => [
      { el: document.querySelectorAll('p')[0]!, text: 'sample text' },
    ],
  }
  beforeEach(() => {
    ADAPTER_REGISTRY.unshift(zhihu)
  })

  it('effectiveRegistry drops disabled adapters and keeps the default last', () => {
    const s: ExtensionSettings = {
      ...SETTINGS,
      adapters: { zhihu: { enabled: false }, default: { enabled: false } },
    }
    expect(effectiveRegistry(s).map((a) => a.id)).toEqual(['default'])
  })

  it('priority orders site adapters; ties keep registration order', () => {
    const a: SiteAdapter = { id: 'aaa', matches: () => true, extract: () => null }
    const b: SiteAdapter = { id: 'bbb', matches: () => true, extract: () => null }
    ADAPTER_REGISTRY.unshift(a, b) // registration order: aaa, bbb, zhihu
    const s: ExtensionSettings = {
      ...SETTINGS,
      adapters: { aaa: { priority: 200 }, bbb: { priority: 50 } },
    }
    expect(effectiveRegistry(s).map((x) => x.id)).toEqual(['bbb', 'zhihu', 'aaa', 'default'])
    // No priorities stored: registration order, default priority for all.
    expect(effectiveRegistry(SETTINGS).map((x) => x.id)).toEqual(['aaa', 'bbb', 'zhihu', 'default'])
    expect(DEFAULT_ADAPTER_PRIORITY).toBe(100)
  })

  it('urlInclude rescues an adapter whose matches() is false', () => {
    const s: ExtensionSettings = {
      ...SETTINGS,
      adapters: { zhihu: { urlInclude: ['other.example'] } },
    }
    makeBody(['hello world here'])
    // matches() is false for other.example, but the include list covers it.
    expect(extractBlocksFor('https://other.example/', document.body, s)).toHaveLength(1)
  })

  it('urlExclude makes a matching adapter fall through to the default', () => {
    const s: ExtensionSettings = {
      ...SETTINGS,
      adapters: { ...SETTINGS.adapters, zhihu: { urlExclude: ['www.zhihu.com'] } },
    }
    const body = makeBody(['hello world here'])
    // zhihu would have produced 'sample text'; excluded -> the generic scan runs.
    expect(extractBlocksFor('https://www.zhihu.com/q/1', body, s).map((b) => b.text)).toEqual([
      'hello world here',
    ])
  })

  it('adapterMatches composes exclude over include+matches', () => {
    const url = new URL('https://www.zhihu.com/')
    expect(adapterMatches(zhihu, url, SETTINGS)).toBe(true)
    const s: ExtensionSettings = {
      ...SETTINGS,
      adapters: { zhihu: { urlExclude: ['*.zhihu.com'] } },
    }
    expect(adapterMatches(zhihu, url, s)).toBe(false)
  })
})

describe('adapterRuntimeConfig (defaults + stored, tolerant)', () => {
  const probe: SiteAdapter = {
    id: 'probe',
    matches: () => true,
    configFields: [
      { key: 'flag', kind: 'boolean', default: true, label: { zh: 'f', en: 'f' } },
      { key: 'level', kind: 'number', default: 3, min: 0, label: { zh: 'l', en: 'l' } },
      {
        key: 'mode',
        kind: 'select',
        default: 'a',
        label: { zh: 'm', en: 'm' },
        options: [
          { value: 'a', label: { zh: 'a', en: 'a' } },
          { value: 'b', label: { zh: 'b', en: 'b' } },
        ],
      },
    ],
    extract: () => null,
  }

  it('returns pure defaults when nothing is stored', () => {
    expect(adapterRuntimeConfig(probe, SETTINGS)).toEqual({ flag: true, level: 3, mode: 'a' })
  })

  it('applies stored overrides; ignores unknown keys, wrong types, stale select values', () => {
    const s: ExtensionSettings = {
      ...SETTINGS,
      adapters: {
        probe: { config: { flag: false, level: 'high', mode: 'nope', ghost: 'boo' } },
      },
    }
    expect(adapterRuntimeConfig(probe, s)).toEqual({ flag: false, level: 3, mode: 'a' })
  })
})

describe('adapter label parity (zh/en)', () => {
  it('every declared configField (and select option) has non-empty zh and en labels', () => {
    for (const adapter of ADAPTER_REGISTRY) {
      for (const f of adapter.configFields ?? []) {
        expect(f.label.zh.trim(), `${adapter.id}.${f.key}.zh`).not.toBe('')
        expect(f.label.en.trim(), `${adapter.id}.${f.key}.en`).not.toBe('')
        for (const o of f.options ?? []) {
          expect(o.label.zh.trim(), `${adapter.id}.${f.key}[${o.value}].zh`).not.toBe('')
          expect(o.label.en.trim(), `${adapter.id}.${f.key}[${o.value}].en`).not.toBe('')
        }
      }
    }
  })

  it('configFields conform to the AdapterConfigField shape', () => {
    const check = (fields: ReadonlyArray<AdapterConfigField>): void => {
      for (const f of fields) {
        expect(['boolean', 'number', 'string', 'select']).toContain(f.kind)
        expect(typeof f.default === 'boolean' || typeof f.default === 'number' || typeof f.default === 'string')
          .toBe(true)
        if (f.kind === 'select') expect(f.options?.length ?? 0).toBeGreaterThan(0)
      }
    }
    for (const adapter of ADAPTER_REGISTRY) check(adapter.configFields ?? [])
  })
})
