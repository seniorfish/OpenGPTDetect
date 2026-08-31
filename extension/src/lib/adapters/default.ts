// ---------- Default adapter (generic heuristic scanning) ----------
// Same contract, different rules: this adapter matches EVERY website and its
// extractor is the generic block scanner — the fallback every site adapter
// defers to, and the template to copy when writing a new one. Its configFields
// own the generic scan heuristics (migrated from global settings in v4).
import { scan, type ScanOptions } from '../dom-scan.ts'
import {
  cfgNum,
  type AdapterConfigField,
  type AdapterRuntimeConfig,
  type SiteAdapter,
} from './index.ts'

/** The generic scan heuristics, now the default adapter's own config. */
export const DEFAULT_CONFIG_FIELDS: ReadonlyArray<AdapterConfigField> = [
  {
    key: 'textBlockMode',
    kind: 'select',
    default: 'article',
    label: { zh: '文本块模式', en: 'Text block mode' },
    options: [
      {
        value: 'article',
        label: { zh: '文章正文（自动忽略导航）', en: 'Article body (skip navigation)' },
      },
      { value: 'all', label: { zh: '全部文本块', en: 'All text blocks' } },
    ],
  },
  {
    key: 'minParagraphChars',
    kind: 'number',
    default: 20,
    min: 0,
    label: { zh: '段落字数下限', en: 'Minimum paragraph chars' },
  },
  {
    key: 'maxBlocksPerPage',
    kind: 'number',
    default: 2000,
    min: 1,
    label: { zh: '每页最大测量块数', en: 'Max measured blocks per page' },
  },
]

/** Typed reader over the resolved config (resolve guarantees these keys exist). */
export function defaultScanOptions(config: AdapterRuntimeConfig): ScanOptions {
  return {
    textBlockMode: config.textBlockMode === 'all' ? 'all' : 'article',
    minParagraphChars: cfgNum(config, 'minParagraphChars', 20),
    maxBlocksPerPage: cfgNum(config, 'maxBlocksPerPage', 2000),
  }
}

export const DEFAULT_ADAPTER: SiteAdapter = {
  id: 'default',
  title: { zh: '默认适配器（通用启发式）', en: 'Default adapter (generic heuristics)' },
  matches: () => true,
  configFields: DEFAULT_CONFIG_FIELDS,
  extract: (ctx) => scan(ctx.root, defaultScanOptions(ctx.config)),
}
