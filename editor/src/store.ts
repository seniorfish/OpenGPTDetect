// ---------- 配置与预设的本地持久化 ----------
import type { Settings, Preset, HeatStyle, ChunkMode } from './types.ts'

const LS_SETTINGS = 'ppl-editor.settings.v1'
const LS_PRESETS = 'ppl-editor.presets.v1'

/**
 * 内置预设（首次运行时写入）。可在代码中直接修改这两个对象。
 * 节点含义：ppl <= 12 绿；12~18 绿->黄渐变；18~50 黄->红；50~100 红->深红；>=100 深红。
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
  // 分层显示（仅 token 模式）
  windowN: 0,
  windowM: 100,
  windowWidth: 10
}

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
    /* 存储不可用时静默失败 */
  }
}

/** 当前配置（内存中的唯一事实来源） */
export const settings: Settings = Object.assign({}, DEFAULT_SETTINGS, loadJson<Partial<Settings>>(LS_SETTINGS, {}))

export function saveSettings(): void {
  saveJson(LS_SETTINGS, settings)
}

/** 预设表：{ [name]: preset } */
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

/** 把当前 settings 中属于“配置方案”的部分抽取为一个预设对象 */
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