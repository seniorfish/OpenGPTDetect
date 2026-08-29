// ---------- Reactive settings state (single source of truth for the UI) ----------
// store.ts stays a framework-free data layer; this module wraps the persisted
// settings in a Vue reactive object for the editor and all components. Mutate it
// and call saveSettings() to write back to localStorage.
import { reactive } from 'vue'
import {
  DEFAULT_SETTINGS, loadSettings, saveSettingsJson
} from '../store.ts'
import type { Settings, Preset, HeatStyle, ChunkMode } from '../types.ts'

/** Current settings (in-memory single source of truth, reactive). */
export const settings: Settings = reactive<Settings>({ ...DEFAULT_SETTINGS, ...loadSettings() })

export function saveSettings(): void {
  saveSettingsJson(settings)
}

/** Extract the preset-shaped portion of the current settings. */
export function presetFromSettings(name: string): Preset {
  return {
    name,
    stops: settings.stops.map((s) => ({ ...s })),
    style: settings.style,
    opacity: settings.opacity,
    chunkMode: settings.chunkMode
  }
}

export function applyPreset(preset: Preset | undefined): void {
  if (!preset) return
  if (Array.isArray(preset.stops) && preset.stops.length) {
    settings.stops = preset.stops.map((s) => ({ ppl: Number(s.ppl), color: s.color }))
  }
  const style = preset.style as HeatStyle
  if (style) settings.style = style
  if (typeof preset.opacity === 'number') settings.opacity = preset.opacity
  const chunkMode = preset.chunkMode as ChunkMode
  if (chunkMode) settings.chunkMode = chunkMode
  saveSettings()
}