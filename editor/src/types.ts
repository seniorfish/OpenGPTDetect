// ---------- Shared data contracts ----------

// Backend HTTP responses (endpoints implemented in server/)
export interface HealthResponse {
  status: string
  model: string
  n_ctx: number
  max_char_count: number
  n_vocab: number
  nll_backend: string
}

/** One token's detail as returned by POST /ppl (char indices are Python code points) */
export interface TokenDetail {
  token_index: number
  token_id: number
  token_text: string
  nll: number | null
  ppl: number | null
  char_start: number | null
  char_end: number | null
}

export interface PplResponse {
  average_ppl: number
  average_nll: number
  token_count: number
  char_count: number
  token_details: TokenDetail[]
}

// App-internal structures (indices are UTF-16 code units)
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
export type HeatStyle = 'background' | 'underline' | 'both'

export interface ColorStop {
  ppl: number
  color: string
}

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
 * never depends on the app's reactive settings singleton.
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