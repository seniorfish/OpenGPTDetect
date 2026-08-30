// ---------- Default adapter (generic heuristic scanning) ----------
// Same contract, different rules: this adapter matches EVERY website and its
// extractor is the generic block scanner — the fallback every site adapter
// defers to, and the template to copy when writing a new one.
import { scan } from '../dom-scan.ts'
import type { SiteAdapter } from './index.ts'

export const DEFAULT_ADAPTER: SiteAdapter = {
  id: 'default',
  matches: () => true,
  extract: (ctx) => scan(ctx.root, ctx.settings),
}
