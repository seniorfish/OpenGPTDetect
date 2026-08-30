// ---------- Preset store (reactive mirror of the persisted preset table) ----------
import { create } from 'zustand'
import { loadPresets, savePreset, deletePreset, renamePreset } from '../store.ts'
import type { Preset } from '../types.ts'

export interface PresetsStore {
  presets: Record<string, Preset>
  upsertPreset: (preset: Preset) => void
  removePreset: (name: string) => void
  renamePresetByName: (oldName: string, newName: string) => void
}

export const usePresetsStore = create<PresetsStore>((set, get) => ({
  presets: loadPresets(),
  upsertPreset: (preset) => {
    savePreset(preset.name, preset)
    set({ presets: { ...get().presets, [preset.name]: preset } })
  },
  removePreset: (name) => {
    deletePreset(name)
    const next = { ...get().presets }
    delete next[name]
    set({ presets: next })
  },
  renamePresetByName: (oldName, newName) => {
    renamePreset(oldName, newName)
    if (!get().presets[oldName]) return
    const next = { ...get().presets }
    next[newName] = next[oldName]
    delete next[oldName]
    set({ presets: next })
  }
}))