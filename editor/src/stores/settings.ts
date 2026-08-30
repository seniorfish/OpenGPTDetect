// ---------- Settings store (single source of truth for the UI) ----------
// The persisted settings delta from store.ts is hydrated into this store; any
// mutation is persisted immediately (immediate-commit). Side effects triggered
// by a change (editor refresh, health probe, auto-reschedule) are handled by the
// app store's subscription, not here.
import { create } from 'zustand'
import { DEFAULT_SETTINGS, loadSettings, saveSettingsJson } from '../store.ts'
import type { Settings, Preset, ChunkMode, HeatStyle } from '../types.ts'

export interface SettingsStore {
  settings: Settings
  patchSettings: (patch: Partial<Settings>) => void
  setChunkMode: (mode: ChunkMode) => void
  toggleAutoRefresh: () => void
  resetStops: () => void
  applyPreset: (preset: Preset | undefined) => void
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS, ...loadSettings() },
  patchSettings: (patch) => {
    const next = { ...get().settings, ...patch }
    saveSettingsJson(next)
    set({ settings: next })
  },
  setChunkMode: (mode) => {
    if (get().settings.chunkMode !== mode) get().patchSettings({ chunkMode: mode })
  },
  toggleAutoRefresh: () => get().patchSettings({ autoRefresh: !get().settings.autoRefresh }),
  resetStops: () => get().patchSettings({ stops: DEFAULT_SETTINGS.stops.map((s) => ({ ...s })) }),
  applyPreset: (preset) => {
    if (!preset) return
    const patch: Partial<Settings> = {}
    if (Array.isArray(preset.stops) && preset.stops.length) {
      patch.stops = preset.stops.map((s) => ({ ppl: Number(s.ppl), color: s.color }))
    }
    const style = preset.style as HeatStyle
    if (style) patch.style = style
    if (typeof preset.opacity === 'number') patch.opacity = preset.opacity
    const chunkMode = preset.chunkMode as ChunkMode
    if (chunkMode) patch.chunkMode = chunkMode
    get().patchSettings(patch)
  }
}))

/** Extract the preset-shaped portion of the current settings. */
export function presetFromSettings(s: Settings, name: string): Preset {
  return {
    name,
    stops: s.stops.map((st) => ({ ...st })),
    style: s.style,
    opacity: s.opacity,
    chunkMode: s.chunkMode
  }
}