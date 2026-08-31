// ---------- Typed i18n (framework-free, editor's pattern) ----------
// The message schema derives from the zh resource; the English resource must
// cover every zh key (checked at compile time via _enSchemaCheck) so a
// missing/typo'd key fails type-checking. The locale is a tiny observable store
// (init from settings, switched at runtime from the options page); t() is a
// plain function so the vanilla content script can use it too.
import { useSyncExternalStore } from 'react'
import zh from '../locales/zh.json'
import en from '../locales/en.json'

export type LocaleSetting = 'auto' | 'zh' | 'en'
export type SupportedLocale = 'zh' | 'en'

/**
 * A label declared inline by a plugin (site adapter) in both UI languages.
 * These bypass the typed MessageKey system on purpose — adapters stay
 * self-contained in one file; a runtime parity test guards zh/en coverage.
 */
export interface BilingualLabel {
  zh: string
  en: string
}

/** Pick the text for `locale`; falls back to the zh entry when blank. */
export function pickLabel(locale: SupportedLocale, label: BilingualLabel): string {
  return label[locale] || label.zh
}

/** Master message schema, derived from the Chinese locale resource. */
export type MessageSchema = typeof zh
export type MessageKey = keyof MessageSchema

type Messages = Record<MessageKey, string>

// Compile-time guard: the English resource must cover every zh key.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _enSchemaCheck: Messages = en as Messages

const messages: Record<SupportedLocale, Messages> = {
  zh: zh as Messages,
  en: en as Messages,
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let msg = messages[locale][key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) msg = msg.split(`{${k}}`).join(String(v))
  }
  return msg
}

// ---------- Locale state + subscription (observable store) ----------
let locale: SupportedLocale = 'zh'
const listeners = new Set<() => void>()

export function getLocale(): SupportedLocale {
  return locale
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setLocale(next: SupportedLocale): void {
  if (next === locale) return
  locale = next
  for (const fn of listeners) fn()
}

/** Apply the persisted setting, resolving 'auto' from the browser language. */
export function initLocale(setting: LocaleSetting): SupportedLocale {
  const next = resolveLocale(setting)
  setLocale(next)
  return next
}

export function resolveLocale(setting: LocaleSetting): SupportedLocale {
  if (setting !== 'auto') return setting
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const lang of langs) {
    if (/^zh/i.test(lang)) return 'zh'
    if (/^en/i.test(lang)) return 'en'
  }
  return 'zh'
}

/** Reactive hook (React contexts only: popup / options / floating UI). */
export function useLocale(): SupportedLocale {
  return useSyncExternalStore(subscribeLocale, getLocale)
}

/** React binding: re-renders on locale change and exposes the translator. */
export function useI18n(): { t: typeof t; locale: SupportedLocale } {
  const locale = useSyncExternalStore(subscribeLocale, getLocale)
  return { t, locale }
}
