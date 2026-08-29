// ---------- Vue i18n setup (composition mode only) ----------
// Typing: MessageSchema derives from the zh resource; the English resource must
// cover every zh key (checked at compile time via _enSchemaCheck) and the exported
// helpers constrain keys to MessageKey, so a missing/typo'd key fails type-checking.
// (The `declare module 'vue-i18n'` augmentation is avoided; it shadows the real
// module under this tsconfig, and vue-i18n's Locales type parameter would pin the
// `locale` ref to a literal union that mismatches our two supported values.)
import { createI18n, useI18n as useVueI18n } from 'vue-i18n'
import { watch } from 'vue'
import type { Ref } from 'vue'
import zh from './locales/zh.json'
import en from './locales/en.json'

export type SupportedLocale = 'zh' | 'en'
export const DEFAULT_LOCALE: SupportedLocale = 'zh'

/** Master message schema, derived from the Chinese locale resource. */
export type MessageSchema = typeof zh

/** Any valid translation key. */
export type MessageKey = keyof MessageSchema

// Compile-time guard: the English resource must cover every zh key.
const _enSchemaCheck: Record<MessageKey, string> = en

const LS_LOCALE = 'ppl-editor.locale.v1'
const PREFERRED_ORDER: Array<{ test: RegExp; locale: SupportedLocale }> = [
  { test: /^zh/i, locale: 'zh' },
  { test: /^en/i, locale: 'en' }
]

/**
 * Resolve the initial locale:
 * 1. a persisted choice, when present;
 * 2. otherwise the first navigator language that maps to a supported locale;
 * 3. otherwise the default.
 */
function detectLocale(): SupportedLocale {
  try {
    const stored = localStorage.getItem(LS_LOCALE)
    if (stored === 'zh' || stored === 'en') return stored
  } catch {
    // Storage unavailable: fall back to navigator detection.
  }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const lang of langs) {
    const hit = PREFERRED_ORDER.find((p) => p.test.test(lang))
    if (hit) return hit.locale
  }
  return DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { zh, en },
  missingWarn: false,
  fallbackWarn: false
})

const { global } = i18n

type TranslateParams = Record<string, string | number>

/** Typed translation helper for non-component code (CodeMirror editor layer). */
export function t(key: MessageKey, params?: TranslateParams): string {
  return params ? global.t(key, params) : global.t(key)
}

/** Typed composition hook for components; returns a locale-reactive `t` and the locale ref. */
export function useI18n(): {
  t: (key: MessageKey, params?: TranslateParams) => string
  locale: Ref<string>
} {
  const { t: rawT, locale } = useVueI18n()
  return {
    t: (key, params) => (params ? rawT(key, params) : rawT(key)),
    locale: locale as Ref<string>
  }
}

/** Apply locale side effects and keep them in sync on switch: persistence, <html lang>, <title>. */
export function initI18nSideEffects(): void {
  document.documentElement.lang = global.locale.value
  document.title = global.t('app.title')
  watch(
    () => global.locale.value,
    (locale) => {
      try {
        localStorage.setItem(LS_LOCALE, locale)
      } catch {
        // Storage unavailable: the choice is session-only.
      }
      document.documentElement.lang = locale
      document.title = global.t('app.title')
    }
  )
}