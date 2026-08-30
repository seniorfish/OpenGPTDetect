// ---------- Shared data contracts ----------
// Backend response types re-export from @opengptdetect/core (the single source);
// the shapes below are app-internal (indices are UTF-16 code units).
import type { ColorStop } from '@opengptdetect/core'

export type {
  HealthResponse,
  PplResponse,
  TokenDetail,
  ColorStop
} from '@opengptdetect/core'

/** A [start, end) half-open span in UTF-16 code units */
export interface Range {
  start: number
  end: number
}

export interface Token {
  tokenIndex: number
  tokenId: number
  text: string
  nll: number | null
  ppl: number | null
  start: number
  end: number
  stale: boolean
}

export interface StatResult {
  nll: number
  ppl: number
  count: number
}

export interface Chunk extends Range {
  stat: StatResult | null
  ignored: boolean
}

// Chunking / heat-map rendering configuration
export type ChunkMode = 'token' | 'sentence' | 'paragraph'
export type HeatStyle = 'background' | 'underline'

export interface Settings {
  serverUrl: string
  chunkMode: ChunkMode
  style: HeatStyle
  opacity: number
  stops: ColorStop[]
  fontFamily: string
  fontSize: number
  autoRefresh: boolean
  windowN: number
  windowM: number
  windowWidth: number
}

/**
 * Subset of `Settings` consumed by the raw editor layer. Injected into
 * `createEditor` as a `getConfig: () => EditorConfig` accessor so the editor
 * never depends on the app's settings store.
 */
export interface EditorConfig {
  chunkMode: ChunkMode
  style: HeatStyle
  opacity: number
  stops: ColorStop[]
  windowN: number
  windowM: number
  fontSize: number
  fontFamily: string
}

export interface Preset {
  name: string
  stops: ColorStop[]
  style: HeatStyle
  opacity: number
  chunkMode: ChunkMode
}