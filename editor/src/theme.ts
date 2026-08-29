// ---------- Theme controller ----------
// Single source of truth for light / dark / system appearance. Applied as the
// `.dark` class on <html> and consumed by the header toggle, the command palette
// and the Toaster. Persisted to localStorage.
import { computed, ref, watch } from 'vue'

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

const theme = ref<Theme>(readStored())

/** The concrete color scheme currently in effect (system resolved to light/dark). */
const resolved = computed<'light' | 'dark'>(() =>
  theme.value === 'system' ? (mq?.matches ? 'dark' : 'light') : theme.value
)

function apply(): void {
  document.documentElement.classList.toggle('dark', resolved.value === 'dark')
}

apply()
watch(resolved, apply)
mq?.addEventListener('change', () => {
  if (theme.value === 'system') apply()
})

export function useTheme(): {
  theme: typeof theme
  resolved: typeof resolved
  setTheme: (t: Theme) => void
  cycle: () => void
} {
  /** Persist and apply a theme choice. */
  function setTheme(t: Theme): void {
    theme.value = t
    try {
      localStorage.setItem(LS_THEME, t)
    } catch {
      // Storage unavailable: the choice is session-only.
    }
  }

  /** Light -> dark -> system -> light loop (used by the header toggle). */
  function cycle(): void {
    const order: Theme[] = ['light', 'dark', 'system']
    setTheme(order[(order.indexOf(theme.value) + 1) % order.length])
  }

  return { theme, resolved, setTheme, cycle }
}