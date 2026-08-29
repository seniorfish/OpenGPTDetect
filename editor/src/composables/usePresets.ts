// ---------- Preset table (reactive mirror of the persisted presets) ----------
import { reactive } from 'vue'
import { loadPresets, savePreset, deletePreset, renamePreset } from '../store.ts'
import type { Preset } from '../types.ts'

/** Reactive { [name]: preset } table; mutating it updates `#sel-preset` options reactively. */
const table = reactive<Record<string, Preset>>(loadPresets())

export function usePresetTable(): Record<string, Preset> {
  return table
}

export function upsertPreset(preset: Preset): void {
  savePreset(preset.name, preset)
  table[preset.name] = preset
}

export function removePreset(name: string): void {
  deletePreset(name)
  delete table[name]
}

export function renamePresetByName(oldName: string, newName: string): void {
  renamePreset(oldName, newName)
  if (table[oldName]) {
    table[newName] = table[oldName]
    delete table[oldName]
  }
}