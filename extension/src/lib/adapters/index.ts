// ---------- Site adapters (block-extraction plug-ins) ----------
// A SiteAdapter customizes WHICH page regions become measurement candidates for
// a given website (e.g. Zhihu feed cards, article body, answers area — sites
// whose DOM structure defeats the generic heuristics). EVERY adapter is the
// same shape: an `extract` implementation plus a `matches` rule. The registry
// is tried by URL; the DEFAULT_ADAPTER (id 'default', matches everything) sits
// last and is symmetric — it is just one more adapter whose rules happen to be
// "generic heuristics over all websites". See docs/extension-site-adapters.md.
//
// Adapters can declare their OWN config (`configFields`): rendered generically
// in the options "adapters" page, persisted under settings.adapters[id], and
// resolved (defaults + stored overrides) into ctx.config at extraction time.
// Universal per-adapter controls (enabled / priority / urlInclude / urlExclude)
// live in the same settings.adapters[id] entry.
import type { ScannedBlock } from '../dom-scan.ts'
import type { BilingualLabel } from '../i18n.ts'
import type { AdapterSettings, ExtensionSettings } from '../settings.ts'
import { hostMatchesList } from '../url-match.ts'
import { DEFAULT_ADAPTER } from './default.ts'

export type AdapterConfigFieldValue = boolean | number | string
/** Resolved adapter config: configFields defaults merged with stored values. */
export type AdapterRuntimeConfig = Record<string, AdapterConfigFieldValue>

/** One user-facing config field declared by an adapter (rendered generically). */
export interface AdapterConfigField {
  key: string
  kind: 'boolean' | 'number' | 'string' | 'select'
  /** Single source of truth for the default; its typeof is the expected value type. */
  default: AdapterConfigFieldValue
  label: BilingualLabel
  hint?: BilingualLabel
  placeholder?: BilingualLabel
  min?: number
  max?: number
  step?: number
  options?: ReadonlyArray<{ value: string; label: BilingualLabel }>
}

export interface SiteAdapterContext {
  url: URL
  root: Element
  settings: ExtensionSettings
  /** Resolved own config for the adapter being invoked. */
  config: AdapterRuntimeConfig
}

export interface SiteAdapter {
  /** Stable identifier, also used in settings/debugging. */
  id: string
  /** Options-UI card title; falls back to `id`. */
  title?: BilingualLabel
  /** URL match rule; the first matching adapter in ADAPTER_REGISTRY wins. */
  matches(url: URL): boolean
  /**
   * Declared own config fields: rendered generically in the options page and
   * persisted under settings.adapters[id].config; resolved values arrive as
   * ctx.config.
   */
  configFields?: ReadonlyArray<AdapterConfigField>
  /**
   * Site-specific candidate blocks (document order).
   * Return null/[] to defer to the DEFAULT_ADAPTER (generic scanner, still
   * filtered by this adapter's `exclude`). Throwing = same deferral (logged).
   */
  extract(ctx: SiteAdapterContext): ScannedBlock[] | null
  /** Optional extra filter applied to EVERY returned block (incl. deferred-to-default ones). */
  exclude?(el: Element, url: URL): boolean
}

export { DEFAULT_ADAPTER } from './default.ts'

/** Registry: site-specific adapters first, the default adapter last. */
export const ADAPTER_REGISTRY: SiteAdapter[] = [DEFAULT_ADAPTER]

/** Default priority for site adapters (lower = tried first). */
export const DEFAULT_ADAPTER_PRIORITY = 100

// ----- per-adapter settings (enabled / priority / url overrides / config) -----

/** The stored settings entry for one adapter id (sparse; {} when untouched). */
export function adapterSettings(id: string, settings: ExtensionSettings): AdapterSettings {
  return settings.adapters[id] ?? {}
}

/**
 * Registry as seen by the engine: enabled site adapters sorted by priority
 * (stable — ties keep registration order), the default adapter always last
 * (it cannot be disabled).
 */
export function effectiveRegistry(settings: ExtensionSettings): SiteAdapter[] {
  const prio = (a: SiteAdapter): number => {
    const p = adapterSettings(a.id, settings).priority
    return typeof p === 'number' ? p : DEFAULT_ADAPTER_PRIORITY
  }
  const active = ADAPTER_REGISTRY.filter(
    (a) => a !== DEFAULT_ADAPTER && adapterSettings(a.id, settings).enabled !== false,
  )
  const sorted = [...active].sort((a, b) => prio(a) - prio(b))
  return [...sorted, DEFAULT_ADAPTER]
}

/** matches(url) OR an include host-pattern, minus excluded hosts. */
export function adapterMatches(
  adapter: SiteAdapter,
  url: URL,
  settings: ExtensionSettings,
): boolean {
  const s = adapterSettings(adapter.id, settings)
  if (hostMatchesList(url.hostname, s.urlExclude ?? [])) return false
  return adapter.matches(url) || hostMatchesList(url.hostname, s.urlInclude ?? [])
}

function valueMatchesField(f: AdapterConfigField, v: unknown): v is AdapterConfigFieldValue {
  if (typeof v !== typeof f.default) return false
  if (f.kind === 'select' && f.options && !f.options.some((o) => o.value === v)) return false
  return true
}

/**
 * Resolve an adapter's own config: defaults from configFields, overridden by
 * stored values. Unknown keys and wrong-typed values are ignored.
 */
export function adapterRuntimeConfig(
  adapter: SiteAdapter,
  settings: ExtensionSettings,
): AdapterRuntimeConfig {
  const stored = adapterSettings(adapter.id, settings).config ?? {}
  const out: AdapterRuntimeConfig = {}
  for (const f of adapter.configFields ?? []) {
    const v = stored[f.key]
    out[f.key] = valueMatchesField(f, v) ? v : f.default
  }
  return out
}

/** Typed readers over a resolved config (resolve guarantees the declared keys). */
export function cfgBool(c: AdapterRuntimeConfig, key: string, fallback = false): boolean {
  const v = c[key]
  return typeof v === 'boolean' ? v : fallback
}
export function cfgNum(c: AdapterRuntimeConfig, key: string, fallback = 0): number {
  const v = c[key]
  return typeof v === 'number' ? v : fallback
}
export function cfgStr(c: AdapterRuntimeConfig, key: string, fallback = ''): string {
  const v = c[key]
  return typeof v === 'string' ? v : fallback
}

/** Raw-registry probe; ignores per-adapter overrides (debug helper). */
export function matchAdapterUrl(href: string): SiteAdapter | undefined {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return undefined
  }
  return ADAPTER_REGISTRY.find((a) => a.matches(url))
}

function extractSafely(adapter: SiteAdapter, ctx: SiteAdapterContext): ScannedBlock[] | null {
  try {
    return adapter.extract(ctx)
  } catch (err) {
    console.warn(`[ppl] adapter "${adapter.id}" failed; using the default adapter`, err)
    return null
  }
}

/**
 * Extract candidate blocks for a URL: the matched site adapter (when it
 * produces blocks) else the default adapter; `exclude` is applied to the final
 * list regardless of which adapter produced it.
 */
export function extractBlocksFor(
  href: string,
  root: Element,
  settings: ExtensionSettings,
): ScannedBlock[] {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    url = new URL('http://localhost/') // invalid page URL: behave as an uninteresting site
  }
  const makeCtx = (a: SiteAdapter): SiteAdapterContext => ({
    url,
    root,
    settings,
    config: adapterRuntimeConfig(a, settings),
  })
  const matched = effectiveRegistry(settings).find(
    (a) => a !== DEFAULT_ADAPTER && adapterMatches(a, url, settings),
  )
  const specific = matched ? extractSafely(matched, makeCtx(matched)) : null
  // The default adapter is the unconditional safety net (never suppressed by
  // urlExclude): null/[]/throw from the site adapter all defer to it.
  const blocks = specific && specific.length ? specific : extractSafely(DEFAULT_ADAPTER, makeCtx(DEFAULT_ADAPTER))!
  return matched?.exclude ? blocks.filter((b) => !matched.exclude!(b.el, url)) : blocks
}

/** Current-page convenience wrapper around {@link extractBlocksFor}. */
export function extractBlocks(root: Element, settings: ExtensionSettings): ScannedBlock[] {
  return extractBlocksFor(location.href, root, settings)
}
