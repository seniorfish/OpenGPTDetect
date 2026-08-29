// ---------- Command registry ----------
// ONE declarative list of every action in the app. Each entry is {id, title,
// keywords, shortcut, group, active/disabled/visible selectors, run}. The same
// array drives BOTH the Ctrl+K command palette and the header's menus/button
// groups, so a new feature is exactly one registry entry (plus, for settings,
// one row in the settings dialog's declarative field list) — never an ad-hoc
// button pile.
import type { LucideIcon } from '@lucide/vue'
import { computed, type ComputedRef } from 'vue'
import {
  AlignLeft, ArrowUpToLine, Ban, ChevronDown, ChevronUp, Languages, Maximize,
  Monitor, Moon, Palette, Play, Quote, RefreshCw, Save, ScanText, Settings,
  SlidersHorizontal, Sun, Undo2, Redo2
} from '@lucide/vue'
import type { MessageKey } from './i18n.ts'
import { t as globalT } from './i18n.ts'
import { settings, saveSettings, applyPreset } from './composables/useSettings.ts'
import { usePresetTable } from './composables/usePresets.ts'
import { useApp } from './composables/useApp.ts'
import { useTheme } from './theme.ts'
import { toast } from './composables/useToasts.ts'
import type { ChunkMode } from './types.ts'

export type CommandGroupId = 'run' | 'edit' | 'display' | 'window' | 'ignore' | 'preset' | 'appearance' | 'app'

export const COMMAND_GROUPS: Array<{ id: CommandGroupId; titleKey: MessageKey }> = [
  { id: 'run', titleKey: 'cmd.group.run' },
  { id: 'edit', titleKey: 'cmd.group.edit' },
  { id: 'display', titleKey: 'cmd.group.display' },
  { id: 'window', titleKey: 'cmd.group.window' },
  { id: 'ignore', titleKey: 'cmd.group.ignore' },
  { id: 'preset', titleKey: 'cmd.group.preset' },
  { id: 'appearance', titleKey: 'cmd.group.appearance' },
  { id: 'app', titleKey: 'cmd.group.app' }
]

export interface CommandDef {
  id: string
  titleKey: MessageKey
  params?: Record<string, string | number>
  keywords: string[]
  group: CommandGroupId
  icon: LucideIcon
  /** Human-readable shortcut hint rendered as a <kbd> in the palette/menus. */
  shortcut?: string
  /** True when the command represents the current state (chunk mode, theme, lang). */
  active?: () => boolean
  disabled?: () => boolean
  visibleWhen?: () => boolean
  run: () => void
}

// ---------- Live app references (module singletons) ----------
const app = useApp()
const { state, settingsChanged, autoRefreshChanged } = app
const { theme, setTheme } = useTheme()

// The locale switching hook is registered by App.vue after the i18n instance is live.
let setLocale: (locale: 'zh' | 'en') => void = () => {}
let getLocale: () => 'zh' | 'en' = () => 'zh'
export function initLocaleHooks(set: typeof setLocale, get: typeof getLocale): void {
  setLocale = set
  getLocale = get
}

// Histogram window actions are mounted by HistogramPanel so the palette and the
// panel share one implementation.
type HistoAction = 'shiftDown' | 'shiftUp' | 'toTop' | 'toAll'
const histoActions: Record<HistoAction, () => void> = {
  shiftDown: () => {},
  shiftUp: () => {},
  toTop: () => {},
  toAll: () => {}
}
export function registerHistoActions(actions: Record<HistoAction, () => void>): void {
  Object.assign(histoActions, actions)
}

// ---------- Shared action handlers (also used by header controls / menus) ----------
export function setChunkMode(mode: ChunkMode): void {
  settings.chunkMode = mode
  saveSettings()
  settingsChanged()
}

export function toggleAutoRefresh(): void {
  settings.autoRefresh = !settings.autoRefresh
  saveSettings()
  autoRefreshChanged(settings.autoRefresh)
}

function chunkModeCommand(mode: ChunkMode, icon: LucideIcon): CommandDef {
  const titleKey = `cmd.chunk${mode.charAt(0).toUpperCase() + mode.slice(1)}`
  return {
    id: `chunk:${mode}`,
    titleKey: titleKey as MessageKey,
    keywords: ['chunk', mode, 'display'],
    group: 'display',
    icon,
    active: () => settings.chunkMode === mode,
    run: () => setChunkMode(mode)
  }
}

function windowCommand(id: string, action: HistoAction, titleKey: MessageKey, icon: LucideIcon): CommandDef {
  return {
    id,
    titleKey,
    icon,
    run: () => histoActions[action](),
    keywords: ['window', 'layer', 'percentile'],
    group: 'window',
    visibleWhen: () => settings.chunkMode === 'token'
  }
}

/**
 * The full command list. Preset-load entries are generated from the (reactive)
 * preset table, so saving a new preset immediately makes it searchable.
 */
export function useCommands(): { groups: typeof COMMAND_GROUPS; commands: ComputedRef<CommandDef[]> } {
  const commands = computed<CommandDef[]>(() => {
    const presets = usePresetTable()

    const base: CommandDef[] = [
      {
        id: 'analyze',
        titleKey: 'cmd.analyze',
        keywords: ['analyze', 'ppl', 'run'],
        group: 'run',
        icon: Play,
        shortcut: 'Ctrl+Enter',
        disabled: () => state.inFlight,
        run: () => void app.analyze(true)
      },
      {
        id: 'autoRefresh',
        titleKey: 'cmd.autoRefresh',
        keywords: ['auto', 'refresh', 'watch'],
        group: 'run',
        icon: RefreshCw,
        active: () => settings.autoRefresh,
        run: toggleAutoRefresh
      },
      { id: 'undo', titleKey: 'cmd.undo', keywords: ['undo', 'history'], group: 'edit', icon: Undo2, shortcut: 'Ctrl+Z', run: () => app.undo() },
      { id: 'redo', titleKey: 'cmd.redo', keywords: ['redo', 'history'], group: 'edit', icon: Redo2, shortcut: 'Ctrl+Y', run: () => app.redo() },
      chunkModeCommand('token', ScanText),
      chunkModeCommand('sentence', Quote),
      chunkModeCommand('paragraph', AlignLeft),
      windowCommand('winDown', 'shiftDown', 'cmd.windowShiftDown', ChevronDown),
      windowCommand('winUp', 'shiftUp', 'cmd.windowShiftUp', ChevronUp),
      windowCommand('winTop', 'toTop', 'cmd.windowTop', ArrowUpToLine),
      windowCommand('winAll', 'toAll', 'cmd.windowAll', Maximize),
      { id: 'ignoreSelection', titleKey: 'cmd.ignoreSelection', keywords: ['ignore', 'selection', 'exclude'], group: 'ignore', icon: Ban, run: () => app.addIgnoreFromSelection() },
      { id: 'ignoreList', titleKey: 'cmd.ignoreList', keywords: ['ignore', 'list', 'manage'], group: 'ignore', icon: SlidersHorizontal, run: () => app.openModal('ignoreList') },
      { id: 'savePreset', titleKey: 'cmd.savePreset', keywords: ['preset', 'save'], group: 'preset', icon: Save, run: () => app.openModal('savePreset') },
      { id: 'managePresets', titleKey: 'cmd.managePresets', keywords: ['preset', 'manage', 'rename', 'delete'], group: 'preset', icon: SlidersHorizontal, run: () => app.openModal('managePresets') },
      { id: 'themeLight', titleKey: 'cmd.themeLight', keywords: ['theme', 'light'], group: 'appearance', icon: Sun, active: () => theme.value === 'light', run: () => setTheme('light') },
      { id: 'themeDark', titleKey: 'cmd.themeDark', keywords: ['theme', 'dark'], group: 'appearance', icon: Moon, active: () => theme.value === 'dark', run: () => setTheme('dark') },
      { id: 'themeSystem', titleKey: 'cmd.themeSystem', keywords: ['theme', 'system'], group: 'appearance', icon: Monitor, active: () => theme.value === 'system', run: () => setTheme('system') },
      { id: 'langZh', titleKey: 'cmd.langZh', keywords: ['language', 'zh', '中文', 'chs'], group: 'appearance', icon: Languages, active: () => getLocale() === 'zh', run: () => setLocale('zh') },
      { id: 'langEn', titleKey: 'cmd.langEn', keywords: ['language', 'en', 'english'], group: 'appearance', icon: Languages, active: () => getLocale() === 'en', run: () => setLocale('en') },
      { id: 'settings', titleKey: 'cmd.settings', keywords: ['settings', 'options', 'preferences'], group: 'app', icon: Settings, run: () => app.openModal('settings') }
    ]

    const presetCommands: CommandDef[] = Object.keys(presets).map((name) => ({
      id: `preset:${name}`,
      titleKey: 'cmd.loadPreset',
      params: { name },
      keywords: ['preset', 'load', name],
      group: 'preset',
      icon: Palette,
      run: () => {
        applyPreset(presets[name])
        settingsChanged()
        toast(globalT('toast.loadedPreset', { name }))
      }
    }))

    return [...base, ...presetCommands]
  })

  return { groups: COMMAND_GROUPS, commands }
}