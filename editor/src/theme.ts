// ---------- Theme controller (framework-free + React hook) ----------
// Single source of truth for light / dark / system appearance. Applied as the
// `.dark` class on <html> and consumed by the header toggle, the command palette
// and the Toaster. Persisted to localStorage.
import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const LS_THEME = 'ppl-editor.theme.v1'

const mq = window.matchMedia?.('(prefers-color-scheme: dark)')

function readStored(): Theme {
  try {
    const v = localStorage.getItem(LS_THEME)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // Storage unavailable: fall back to system preference.
  }
  return 'system'
}

let theme: Theme = readStored()

/** The concrete color scheme currently in effect (system resolved to light/dark). */
export function getResolvedTheme(): 'light' | 'dark' {
  return theme === 'system' ? (mq?.matches ? 'dark' : 'light') : theme
}

function apply(): void {
  document.documentElement.classList.toggle('dark', getResolvedTheme() === 'dark')
}

// ---------- Subscription (consumed by useSyncExternalStore) ----------
type ThemeListener = () => void
const listeners = new Set<ThemeListener>()

export function getTheme(): Theme {
  return theme
}

export function subscribeTheme(listener: ThemeListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notifyTheme(): void {
  for (const fn of listeners) fn()
}

export function setTheme(t: Theme): void {
  theme = t
  try {
    localStorage.setItem(LS_THEME, t)
  } catch {
    // Storage unavailable: the choice is session-only.
  }
  apply()
  notifyTheme()
}

/** Light -> dark -> system -> light loop (used by the header toggle). */
export function cycleTheme(): void {
  const order: Theme[] = ['light', 'dark', 'system']
  setTheme(order[(order.indexOf(theme) + 1) % order.length])
}

apply()
mq?.addEventListener('change', () => {
  if (theme === 'system') {
    apply()
    notifyTheme()
  }
})

/** React hook: re-renders when the effective theme changes. */
export function useTheme(): {
  theme: Theme
  resolved: 'light' | 'dark'
  setTheme: (t: Theme) => void
  cycle: () => void
} {
  const current = useSyncExternalStore(subscribeTheme, getTheme)
  const resolved = useSyncExternalStore(subscribeTheme, getResolvedTheme)
  return { theme: current, resolved, setTheme, cycle: cycleTheme }
}