// ---------- PPL scale profile format (single source of truth) ----------
// The shareable configuration document: a color scale (ppl -> color anchors) plus
// a guideline (per-ppl text-classification thresholds). `scope` is free-form text
// describing what the profile is FOR (language, domain, style) — never a hard enum,
// so future profiles ("zh code docs", "en fiction") need no schema change.
// The Zod schema below is the TS source of truth; `z.toJSONSchema` derives
// docs/schemas/ppl-scale-v1.schema.json for Python/community consumers.
import { z } from 'zod'

export const ColorStopSchema = z.object({
  ppl: z.number().nonnegative(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i)
})
export type ColorStop = z.infer<typeof ColorStopSchema>

export const GuidelineSchema = z.object({
  /** avg ppl below this => AI-like verdict. */
  aiLikePplMax: z.number().nonnegative(),
  /** avg ppl above this => high-quality human text. */
  humanLikePplMin: z.number().nonnegative(),
  /** avg ppl above this => hard to read. */
  hardPplMin: z.number().nonnegative()
})
export type Guideline = z.infer<typeof GuidelineSchema>

export const PplScaleProfileSchema = z.object({
  $schema: z.string().optional(),
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  /** Free-form description of the applicability scope (language/domain/format). */
  scope: z.string().min(1),
  tags: z.array(z.string()).min(1).optional(),
  scale: z.object({
    mode: z.literal('linear'),
    stops: z.array(ColorStopSchema).min(1)
  }),
  guideline: GuidelineSchema
})
export type PplScaleProfile = z.infer<typeof PplScaleProfileSchema>

export const PROFILE_SCHEMA_VERSION = 1

/** Default checkpoints are the canonical ones from the layout/experience data. */
const SCALE_ZH: ColorStop[] = [
  { ppl: 12, color: '#22c55e' },
  { ppl: 18, color: '#eab308' },
  { ppl: 50, color: '#ef4444' },
  { ppl: 100, color: '#7f1d1d' }
]
const SCALE_EN: ColorStop[] = [
  { ppl: 4, color: '#22c55e' },
  { ppl: 6, color: '#eab308' },
  { ppl: 16.67, color: '#ef4444' },
  { ppl: 33.33, color: '#7f1d1d' }
]

export const BUILTIN_PROFILES: PplScaleProfile[] = [
  {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id: 'zh-default-2026',
    name: '中文默认',
    scope: '中文通用文本(zh, general text)',
    tags: ['zh', 'general'],
    scale: { mode: 'linear', stops: SCALE_ZH },
    guideline: { aiLikePplMax: 18, humanLikePplMin: 35, hardPplMin: 50 }
  },
  {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id: 'en-default-2026',
    name: 'English default',
    scope: 'General English prose (en, general text)',
    tags: ['en', 'general'],
    scale: { mode: 'linear', stops: SCALE_EN },
    guideline: { aiLikePplMax: 6, humanLikePplMin: 18, hardPplMin: 25 }
  }
]

export function parseProfile(input: unknown): PplScaleProfile {
  return PplScaleProfileSchema.parse(input)
}

export function tryParseProfile(input: unknown): PplScaleProfile | null {
  const r = PplScaleProfileSchema.safeParse(input)
  return r.success ? r.data : null
}

/** Human-readable validation errors (for UI toast / import dialogs). */
export function profileIssues(input: unknown): string[] {
  const r = PplScaleProfileSchema.safeParse(input)
  return r.success ? [] : r.error.issues.map((iss) => `${iss.path.join('.')}: ${iss.message}`)
}
