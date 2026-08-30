// ---------- Backend response contracts (single source of truth) ----------
// The server's HTTP shapes are defined here as Zod schemas; the TS types derive
// from them so a schema edit is a type error everywhere the response is consumed.
// `api.ts` parses every inbound payload through these schemas — there is no `as T`.
import { z } from 'zod'

export const HealthResponseSchema = z.object({
  status: z.string(),
  model: z.string(),
  // `n_ctx` is null on the mock backend (it has no context window).
  n_ctx: z.number().nullable(),
  max_char_count: z.number(),
  n_vocab: z.number(),
  nll_backend: z.string()
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

/** One token's detail as returned by POST /ppl (char indices are Python code points). */
export const TokenDetailSchema = z.object({
  token_index: z.number(),
  token_id: z.number(),
  token_text: z.string(),
  nll: z.number().nullable(),
  ppl: z.number().nullable(),
  char_start: z.number().nullable(),
  char_end: z.number().nullable()
})
export type TokenDetail = z.infer<typeof TokenDetailSchema>

export const PplResponseSchema = z.object({
  average_ppl: z.number(),
  average_nll: z.number(),
  token_count: z.number(),
  char_count: z.number(),
  token_details: z.array(TokenDetailSchema)
})
export type PplResponse = z.infer<typeof PplResponseSchema>