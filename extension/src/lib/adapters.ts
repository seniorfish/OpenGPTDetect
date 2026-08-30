// ---------- Site adapters (block-extraction plug-ins) ----------
// A SiteAdapter customizes WHICH page regions become measurement candidates for
// a given website (e.g. Zhihu feed cards, article body, answers area — sites
// whose DOM structure defeats the generic heuristics). The registry is tried by
// URL; the first match wins. Returning null from `extract` (or no `extract`)
// falls back to the generic scanner, so an adapter only overrides what it
// knows. See docs/extension-site-adapters.md for the design discussion.
import { scan, type ScannedBlock } from './dom-scan.ts'
import type { ExtensionSettings } from './settings.ts'

export interface SiteAdapter {
  /** Stable identifier, also used in settings/debugging. */
  id: string
  /** URL match rule; adapters earlier in REGISTRY win. */
  matches(url: URL): boolean
  /**
   * Site-specific candidate blocks (document order). Return null to defer to
   * the generic scanner; throw = same fallback (logged).
   */
  extract?(root: Element, settings: ExtensionSettings): ScannedBlock[] | null
  /** Optional extra filter on blocks produced by `extract`. */
  exclude?(el: Element, url: URL): boolean
}

export const GENERIC_ADAPTER: SiteAdapter = {
  id: 'generic',
  matches: () => true,
}

/** Registry: site-specific adapters first (registered in order of preference). */
export const ADAPTER_REGISTRY: SiteAdapter[] = [GENERIC_ADAPTER]

export function matchAdapterUrl(href: string): SiteAdapter | undefined {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return undefined
  }
  return ADAPTER_REGISTRY.find((a) => a.matches(url))
}

/**
 * Extract candidate blocks for a URL: the matched site adapter (when it has
 * its own extractor) else the generic heuristic scanner.
 */
export function extractBlocksFor(
  href: string,
  root: Element,
  settings: ExtensionSettings,
): ScannedBlock[] {
  const adapter = matchAdapterUrl(href)
  if (adapter?.extract) {
    try {
      const found = adapter.extract(root, settings)
      if (found) {
        const url = new URL(href)
        return adapter.exclude ? found.filter((b) => !adapter.exclude!(b.el, url)) : found
      }
    } catch (err) {
      console.warn(`[ppl] adapter "${adapter.id}" failed; using the generic scanner`, err)
    }
  }
  return scan(root, settings)
}

/** Current-page convenience wrapper around {@link extractBlocksFor}. */
export function extractBlocks(root: Element, settings: ExtensionSettings): ScannedBlock[] {
  return extractBlocksFor(location.href, root, settings)
}
