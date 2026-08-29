// ---------- Settings & preset persistence (framework-free data layer) ----------
import type { Settings, Preset } from './types.ts'

export const LS_SETTINGS = 'ppl-editor.settings.v1'
export const LS_PRESETS = 'ppl-editor.presets.v1'

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable: fail silently.
  }
}

/** Read the persisted settings delta (empty object when none). */
export function loadSettings(): Partial<Settings> {
  return loadJson<Partial<Settings>>(LS_SETTINGS, {})
}

/** Persist the current settings (works with a reactive object; serializes its values). */
export function saveSettingsJson(value: unknown): void {
  saveJson(LS_SETTINGS, value)
}

/**
 * Built-in presets (written on first run). Editable directly in this file.
 * Node meaning: ppl <= 12 green; 12~18 green->yellow gradient; 18~50 yellow->red;
 * 50~100 red->dark red; >=100 dark red.
 */
export const BUILTIN_PRESETS: Preset[] = [
  {
    name: '中文预设',
    stops: [
      { ppl: 12, color: '#22c55e' },
      { ppl: 18, color: '#eab308' },
      { ppl: 50, color: '#ef4444' },
      { ppl: 100, color: '#7f1d1d' }
    ],
    style: 'background', // background | underline | both
    opacity: 0.45,
    chunkMode: 'sentence' // token | sentence | paragraph
  },
  {
    name: '英文预设',
    stops: [
      { ppl: 4, color: '#22c55e' },
      { ppl: 6, color: '#eab308' },
      { ppl: 16.67, color: '#ef4444' },
      { ppl: 33.33, color: '#7f1d1d' }
    ],
    style: 'background',
    opacity: 0.45,
    chunkMode: 'sentence'
  }
]

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: 'http://127.0.0.1:8000',
  chunkMode: 'sentence',
  style: 'background',
  opacity: 0.45,
  stops: BUILTIN_PRESETS[0].stops.map((s) => ({ ...s })),
  fontFamily: "'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif",
  fontSize: 16,
  autoRefresh: false,
  // Layered display (token mode only)
  windowN: 0,
  windowM: 100,
  windowWidth: 10
}

/** Preset table: { [name]: preset } */
export function loadPresets(): Record<string, Preset> {
  let presets: Record<string, Preset> | null = loadJson<Record<string, Preset> | null>(LS_PRESETS, null)
  if (!presets || typeof presets !== 'object' || Object.keys(presets).length === 0) {
    presets = {}
    for (const p of BUILTIN_PRESETS) presets[p.name] = p
    saveJson(LS_PRESETS, presets)
  }
  return presets!
}

export function savePreset(name: string, preset: Preset): void {
  const presets = loadPresets()
  presets[name] = preset
  saveJson(LS_PRESETS, presets)
}

export function deletePreset(name: string): void {
  const presets = loadPresets()
  delete presets[name]
  saveJson(LS_PRESETS, presets)
}

export function renamePreset(oldName: string, newName: string): void {
  const presets = loadPresets()
  if (!presets[oldName]) return
  presets[newName] = presets[oldName]
  delete presets[oldName]
  saveJson(LS_PRESETS, presets)
}