// ---------- Typed i18n (framework-free core + React hook) ----------
// The message schema derives from the zh resource; the English resource must
// cover every zh key (checked at compile time via _enSchemaCheck) and the
// exported helpers constrain keys to MessageKey, so a missing/typo'd key fails
// type-checking. `t()` stays a plain function so the CodeMirror layer can use
// it; `useI18n()` binds the current locale reactively via useSyncExternalStore.
import { useSyncExternalStore } from 'react'
import zh from './locales/zh.json'
import en from './locales/en.json'

export type SupportedLocale = 'zh' | 'en'
export const DEFAULT_LOCALE: SupportedLocale = 'zh'

/** Master message schema, derived from the Chinese locale resource. */
export type MessageSchema = typeof zh

/** Any valid translation key. */
export type MessageKey = keyof MessageSchema

type Messages = Record<MessageKey, string>

// Compile-time guard: the English resource must cover every zh key.
const _enSchemaCheck: Messages = en as Messages

const messages: Record<SupportedLocale, Messages> = {
  zh: zh as Messages,
  en: en as Messages
}

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

// ---------- Locale state + subscription ----------
type LocaleListener = () => void
const listeners = new Set<LocaleListener>()

let locale: SupportedLocale = detectLocale()

export function getLocale(): SupportedLocale {
  return locale
}

export function subscribeLocale(listener: LocaleListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notifyLocale(): void {
  for (const fn of listeners) fn()
}

function applyDocumentLocale(): void {
  document.documentElement.lang = locale
  document.title = t('app.title')
}

export function setLocale(next: SupportedLocale): void {
  if (next === locale) return
  locale = next
  try {
    localStorage.setItem(LS_LOCALE, next)
  } catch {
    // Storage unavailable: the choice is session-only.
  }
  applyDocumentLocale()
  notifyLocale()
}

type TranslateParams = Record<string, string | number>
const INTERP = /\{(\w+)\}/g

/** Typed translation helper for any code (plain function; locale-fixed per call). */
export function t(key: MessageKey, params?: TranslateParams): string {
  const template = (messages[locale] ?? messages[DEFAULT_LOCALE])[key] ?? key
  if (!params) return template
  return template.replace(INTERP, (_, name: string) => String(params[name] ?? ''))
}

/** Typed React hook: re-renders when the locale changes. */
export function useI18n(): {
  t: (key: MessageKey, params?: TranslateParams) => string
  locale: SupportedLocale
} {
  const current = useSyncExternalStore(subscribeLocale, getLocale)
  return {
    t: (key, params) => t(key, params),
    locale: current
  }
}

/** Apply locale side effects once at startup: <html lang>, <title>. */
export function initI18nSideEffects(): void {
  applyDocumentLocale()
}