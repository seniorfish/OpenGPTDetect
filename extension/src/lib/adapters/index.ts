// ---------- Site adapters (block-extraction plug-ins) ----------
// A SiteAdapter customizes WHICH page regions become measurement candidates for
// a given website (e.g. Zhihu feed cards, article body, answers area — sites
// whose DOM structure defeats the generic heuristics). EVERY adapter is the
// same shape: an `extract` implementation plus a `matches` rule. The registry
// is tried by URL; the DEFAULT_ADAPTER (id 'default', matches everything) sits
// last and is symmetric — it is just one more adapter whose rules happen to be
// "generic heuristics over all websites". See docs/extension-site-adapters.md.
import type { ScannedBlock } from '../dom-scan.ts'
import type { ExtensionSettings } from '../settings.ts'
import { DEFAULT_ADAPTER } from './default.ts'

export interface SiteAdapterContext {
  url: URL
  root: Element
  settings: ExtensionSettings
}

export interface SiteAdapter {
  /** Stable identifier, also used in settings/debugging. */
  id: string
  /** URL match rule; the first matching adapter in ADAPTER_REGISTRY wins. */
  matches(url: URL): boolean
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
  const ctx: SiteAdapterContext = { url, root, settings }
  const adapter = ADAPTER_REGISTRY.find((a) => a.matches(url)) ?? DEFAULT_ADAPTER
  const specific = adapter !== DEFAULT_ADAPTER ? extractSafely(adapter, ctx) : null
  const blocks = specific && specific.length ? specific : extractSafely(DEFAULT_ADAPTER, ctx)!
  return adapter.exclude ? blocks.filter((b) => !adapter.exclude!(b.el, url)) : blocks
}

/** Current-page convenience wrapper around {@link extractBlocksFor}. */
export function extractBlocks(root: Element, settings: ExtensionSettings): ScannedBlock[] {
  return extractBlocksFor(location.href, root, settings)
}
