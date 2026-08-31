// ---------- Extension settings: schema, defaults, typed storage ----------
// One Zod schema is the source of truth (untrusted values are re-validated on
// every read); `@wxt-dev/storage` supplies versioned persistence. The "which
// profile for which detected class" binding lives here, NOT in the profile
// files themselves (profiles are pure data).
import { z } from 'zod'
import { storage } from 'wxt/utils/storage'
import {
  BUILTIN_PROFILES,
  ColorStopSchema,
  PplScaleProfileSchema,
  type PplScaleProfile,
} from '@opengptdetect/core'

/**
 * Per-adapter settings entry (sparse; defaults live in each adapter's
 * configFields). Unknown adapter ids and unknown config keys are tolerated:
 * zod's default strip + the engine's field lookup ignore them.
 * NOTE: no `.strict()` here — getSettings() falls back all-or-nothing, so one
 * unknown key must not reset every setting.
 */
export const AdapterSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  urlInclude: z.array(z.string()).optional(),
  urlExclude: z.array(z.string()).optional(),
  // zod v4: record requires two arguments.
  config: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])).optional(),
})
export type AdapterSettings = z.infer<typeof AdapterSettingsSchema>

export const ExtensionSettingsSchema = z.object({
  enabled: z.boolean(),
  shortcutEnabled: z.boolean(),
  /** UI language: 'auto' = detect from the browser/system language. */
  locale: z.enum(['auto', 'zh', 'en']),

  apiBaseUrl: z.string(),

  // Text-block merging (pipeline-level: groupUnits runs on every adapter's output)
  mergeAdjacentShortParagraphs: z.boolean(),
  mergeMaxGapChars: z.number().int().min(0),

  // Language detection
  englishCharRatioThreshold: z.number().min(0).max(1),

  // Chunking / requests
  maxCharsPerRequest: z.number().int().min(1),

  // Viewport & loading
  initialMeasureWords: z.number().int().min(0),
  measureConcurrency: z.number().int().min(1).max(8),
  viewportRootMargin: z.string(),
  loadingIndicator: z.enum(['icon', 'spinner', 'none']),

  // Annotations
  annotateThresholdChars: z.number().int().min(0),
  showPplLabel: z.boolean(),

  // AI detection
  aiDetectEnabled: z.boolean(),
  aiMinReliableTokens: z.number().int().min(0),
  reliableMinChars: z.number().int().min(0),
  aiTagEnabled: z.boolean(),
  aiBorderEnabled: z.boolean(),
  aiBorderColor: z.string().regex(/^#[0-9a-f]{6}$/i),

  // Heat map
  heatmapEnabled: z.boolean(),
  heatmapStyle: z.enum(['background', 'underline', 'bottombar']),
  heatmapOpacity: z.number().min(0.05).max(0.8),
  smoothingMode: z.enum(['token', 'sentence']),
  smoothingWindowSize: z.number().int().min(1).max(9),

  // Detected-class -> profile binding (profile files stay pure data).
  profiles: z.object({
    zh: z.string().min(1),
    en: z.string().min(1),
  }),

  // User color-stack override; null = follow the bound profile's stops (S7).
  scaleOverrides: z.array(ColorStopSchema).min(1).nullable(),

  // Site lists
  listMode: z.enum(['off', 'blacklist', 'whitelist']),
  whitelist: z.array(z.string()),
  blacklist: z.array(z.string()),

  // Per-adapter overrides; defaults live in each adapter's configFields.
  adapters: z.record(z.string(), AdapterSettingsSchema),
})
export type ExtensionSettings = z.infer<typeof ExtensionSettingsSchema>

/** Defaults carry the empirical thresholds (unchanged from the legacy extension). */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  shortcutEnabled: true,
  locale: 'auto',

  apiBaseUrl: 'http://127.0.0.1:8000',

  mergeAdjacentShortParagraphs: true,
  mergeMaxGapChars: 60,

  englishCharRatioThreshold: 0.5,

  maxCharsPerRequest: 1500,

  initialMeasureWords: 300,
  measureConcurrency: 1,
  viewportRootMargin: '600px',
  loadingIndicator: 'icon',

  annotateThresholdChars: 30,
  showPplLabel: true,

  aiDetectEnabled: true,
  aiMinReliableTokens: 20,
  reliableMinChars: 40,
  aiTagEnabled: true,
  aiBorderEnabled: true,
  aiBorderColor: '#8b5cf6',

  heatmapEnabled: true,
  heatmapStyle: 'background',
  heatmapOpacity: 0.35,
  smoothingMode: 'token',
  smoothingWindowSize: 2,

  profiles: { zh: 'zh-default-2026', en: 'en-default-2026' },
  scaleOverrides: null,

  listMode: 'blacklist',
  whitelist: [],
  blacklist: [],

  adapters: {},
}

export const settingsItem = storage.defineItem<ExtensionSettings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
  version: 4,
  migrations: {
    // v1 -> v2: add the profile color-stack override (none stored before S7).
    2: (old) => ({ ...old, scaleOverrides: null }),
    // v2 -> v3: add the UI language setting (defaults to browser detection).
    3: (old) => ({ ...old, locale: 'auto' }),
    // v3 -> v4: the three generic-scan params become the default adapter's own config.
    4: (old) => {
      const src = old as Record<string, unknown>
      const { textBlockMode, minParagraphChars, maxBlocksPerPage, ...rest } = src
      // Filter to primitive values: keys absent from older stores arrive as
      // undefined and must not enter the config record (would fail validation).
      const moved: Record<string, boolean | number | string> = {}
      for (const [k, v] of Object.entries({ textBlockMode, minParagraphChars, maxBlocksPerPage })) {
        if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') moved[k] = v
      }
      const entries =
        typeof rest.adapters === 'object' && rest.adapters !== null
          ? (rest.adapters as Record<string, unknown>)
          : {}
      const def =
        typeof entries['default'] === 'object' && entries['default'] !== null
          ? (entries['default'] as Record<string, unknown>)
          : {}
      return {
        ...rest,
        adapters: {
          ...entries,
          default: { ...def, config: { ...(def['config'] as object | undefined), ...moved } },
        },
      }
    },
  },
})

/** Read + re-validate (defense-in-depth against tampered storage). */
export async function getSettings(): Promise<ExtensionSettings> {
  const raw = await settingsItem.getValue()
  const parsed = ExtensionSettingsSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  // Fall back to defaults when the stored value is corrupt.
  return { ...DEFAULT_SETTINGS }
}

export async function setSettingsPatch(
  patch: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const next = { ...(await getSettings()), ...patch }
  const parsed = ExtensionSettingsSchema.parse(next)
  await settingsItem.setValue(parsed)
  return parsed
}

// ----- User profile library (imported profiles, pure storage, validated) -----

export const profileLibItem = storage.defineItem<PplScaleProfile[]>('local:profileLib', {
  fallback: [],
  version: 1,
})

/** Read + re-validate every stored profile (defense-in-depth). */
export async function getProfileLib(): Promise<PplScaleProfile[]> {
  const raw = await profileLibItem.getValue()
  return Array.isArray(raw) ? raw.filter((p) => PplScaleProfileSchema.safeParse(p).success) : []
}

export async function upsertProfile(profile: PplScaleProfile): Promise<PplScaleProfile[]> {
  const lib = await getProfileLib()
  const next = [...lib.filter((p) => p.id !== profile.id), profile]
  await profileLibItem.setValue(next)
  return next
}

export async function removeProfile(id: string): Promise<PplScaleProfile[]> {
  const lib = await getProfileLib()
  const next = lib.filter((p) => p.id !== id)
  await profileLibItem.setValue(next)
  return next
}

/** Built-in + user profiles; the user library cannot shadow a built-in id. */
export function allProfiles(lib: PplScaleProfile[]): PplScaleProfile[] {
  return [...BUILTIN_PROFILES, ...lib.filter((p) => !BUILTIN_PROFILES.some((b) => b.id === p.id))]
}

/** Resolve a bound id to its profile (built-ins win; the library cannot shadow them). */
export function findProfile(id: string, lib: PplScaleProfile[]): PplScaleProfile | undefined {
  return BUILTIN_PROFILES.find((p) => p.id === id) ?? lib.find((p) => p.id === id)
}

/** One-shot migration of the legacy flat chrome.storage.local keys (pre-S5). */
export async function migrateLegacyStorage(): Promise<void> {
  const legacy = await browser.storage.local.get(null)
  const probe: Record<string, unknown> = legacy as Record<string, unknown>
  const hasLegacy = 'apiBaseUrl' in probe || 'textBlockMode' in probe
  if (!hasLegacy) return
  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  const allowed = Object.keys(DEFAULT_SETTINGS)
  for (const k of allowed) {
    if (k in probe && probe[k] != null) settings[k] = probe[k]
  }
  // The generic-scan params live in the default adapter's config since v4.
  const scanConfig: Record<string, boolean | number | string> = {}
  for (const k of ['textBlockMode', 'minParagraphChars', 'maxBlocksPerPage'] as const) {
    const v = probe[k]
    if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') scanConfig[k] = v
  }
  if (Object.keys(scanConfig).length) {
    const prev = (settings.adapters ?? {}) as Record<string, AdapterSettings>
    const def = prev['default'] ?? {}
    settings.adapters = { ...prev, default: { ...def, config: { ...def.config, ...scanConfig } } }
  }
  // The old color stacks are superseded by the built-in profiles (S7 removes these keys).
  const parsed = ExtensionSettingsSchema.safeParse(settings)
  if (parsed.success) {
    await settingsItem.setValue(parsed.data)
    const del: string[] = []
    for (const k of Object.keys(probe)) if (!k.startsWith('__')) del.push(k)
    if (del.length) await browser.storage.local.remove(del)
  }
}
