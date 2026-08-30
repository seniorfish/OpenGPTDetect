// ---------- Command registry ----------
// ONE declarative list of every action in the app. Each entry is {id, title,
// keywords, shortcut, group, active/disabled/visible selectors, run}. The same
// array drives BOTH the Ctrl+K command palette and the header's menus/button
// groups, so a new feature is exactly one registry entry (plus, for settings,
// one row in the settings dialog's declarative field list) — never an ad-hoc
// button pile. The array is rebuilt by `useCommands` whenever the states that
// govern active/disabled/visible change, so those selectors are plain booleans
// rather than functions.
import type { LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import {
  AlignLeft, ArrowUpToLine, Ban, ChevronDown, ChevronUp, Languages, Maximize,
  Monitor, Moon, Palette, Play, Quote, RefreshCw, Save, ScanText, Settings,
  SlidersHorizontal, Sun, Undo2, Redo2
} from 'lucide-react'
import type { MessageKey } from './i18n.ts'
import { t as globalT } from './i18n.ts'
import { useSettingsStore } from './stores/settings.ts'
import { usePresetsStore } from './stores/presets.ts'
import { useAppStore } from './stores/app.ts'
import { useTheme, setTheme } from './theme.ts'
import { setLocale, useI18n } from './i18n.ts'
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
  active?: boolean
  disabled?: boolean
  visibleWhen?: boolean
  run: () => void
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

function chunkModeCommand(mode: ChunkMode, icon: LucideIcon, chunkMode: ChunkMode): CommandDef {
  const titleKey = `cmd.chunk${mode.charAt(0).toUpperCase() + mode.slice(1)}`
  return {
    id: `chunk:${mode}`,
    titleKey: titleKey as MessageKey,
    keywords: ['chunk', mode, 'display'],
    group: 'display',
    icon,
    active: chunkMode === mode,
    run: () => useSettingsStore.getState().setChunkMode(mode)
  }
}

function windowCommand(id: string, action: HistoAction, titleKey: MessageKey, icon: LucideIcon, visible: boolean): CommandDef {
  return {
    id,
    titleKey,
    icon,
    run: () => histoActions[action](),
    keywords: ['window', 'layer', 'percentile'],
    group: 'window',
    visibleWhen: visible
  }
}

/**
 * The full command list. Preset-load entries are generated from the preset
 * table, so saving a new preset immediately makes it searchable. Rebuilt when
 * chunk mode / auto-refresh / flight state / theme / locale / presets change.
 */
export function useCommands(): { groups: typeof COMMAND_GROUPS; commands: CommandDef[] } {
  const chunkMode = useSettingsStore((s) => s.settings.chunkMode)
  const autoRefresh = useSettingsStore((s) => s.settings.autoRefresh)
  const inFlight = useAppStore((s) => s.inFlight)
  const presets = usePresetsStore((s) => s.presets)
  const { theme } = useTheme()
  const { locale } = useI18n()

  const commands = useMemo<CommandDef[]>(() => {
    const base: CommandDef[] = [
      {
        id: 'analyze',
        titleKey: 'cmd.analyze',
        keywords: ['analyze', 'ppl', 'run'],
        group: 'run',
        icon: Play,
        shortcut: 'Ctrl+Enter',
        disabled: inFlight,
        run: () => void useAppStore.getState().analyze(true)
      },
      {
        id: 'autoRefresh',
        titleKey: 'cmd.autoRefresh',
        keywords: ['auto', 'refresh', 'watch'],
        group: 'run',
        icon: RefreshCw,
        active: autoRefresh,
        run: () => useSettingsStore.getState().toggleAutoRefresh()
      },
      { id: 'undo', titleKey: 'cmd.undo', keywords: ['undo', 'history'], group: 'edit', icon: Undo2, shortcut: 'Ctrl+Z', run: () => useAppStore.getState().undo() },
      { id: 'redo', titleKey: 'cmd.redo', keywords: ['redo', 'history'], group: 'edit', icon: Redo2, shortcut: 'Ctrl+Y', run: () => useAppStore.getState().redo() },
      chunkModeCommand('token', ScanText, chunkMode),
      chunkModeCommand('sentence', Quote, chunkMode),
      chunkModeCommand('paragraph', AlignLeft, chunkMode),
      windowCommand('winDown', 'shiftDown', 'cmd.windowShiftDown', ChevronDown, chunkMode === 'token'),
      windowCommand('winUp', 'shiftUp', 'cmd.windowShiftUp', ChevronUp, chunkMode === 'token'),
      windowCommand('winTop', 'toTop', 'cmd.windowTop', ArrowUpToLine, chunkMode === 'token'),
      windowCommand('winAll', 'toAll', 'cmd.windowAll', Maximize, chunkMode === 'token'),
      { id: 'ignoreSelection', titleKey: 'cmd.ignoreSelection', keywords: ['ignore', 'selection', 'exclude'], group: 'ignore', icon: Ban, run: () => useAppStore.getState().addIgnoreFromSelection() },
      { id: 'savePreset', titleKey: 'cmd.savePreset', keywords: ['preset', 'save'], group: 'preset', icon: Save, run: () => useAppStore.getState().openModal('savePreset') },
      { id: 'managePresets', titleKey: 'cmd.managePresets', keywords: ['preset', 'manage', 'rename', 'delete'], group: 'preset', icon: SlidersHorizontal, run: () => useAppStore.getState().openModal('managePresets') },
      { id: 'themeLight', titleKey: 'cmd.themeLight', keywords: ['theme', 'light'], group: 'appearance', icon: Sun, active: theme === 'light', run: () => setTheme('light') },
      { id: 'themeDark', titleKey: 'cmd.themeDark', keywords: ['theme', 'dark'], group: 'appearance', icon: Moon, active: theme === 'dark', run: () => setTheme('dark') },
      { id: 'themeSystem', titleKey: 'cmd.themeSystem', keywords: ['theme', 'system'], group: 'appearance', icon: Monitor, active: theme === 'system', run: () => setTheme('system') },
      { id: 'langZh', titleKey: 'cmd.langZh', keywords: ['language', 'zh', '中文', 'chs'], group: 'appearance', icon: Languages, active: locale === 'zh', run: () => setLocale('zh') },
      { id: 'langEn', titleKey: 'cmd.langEn', keywords: ['language', 'en', 'english'], group: 'appearance', icon: Languages, active: locale === 'en', run: () => setLocale('en') },
      { id: 'settings', titleKey: 'cmd.settings', keywords: ['settings', 'options', 'preferences'], group: 'app', icon: Settings, run: () => useAppStore.getState().openModal('settings') }
    ]

    const presetCommands: CommandDef[] = Object.keys(presets).map((name) => ({
      id: `preset:${name}`,
      titleKey: 'cmd.loadPreset',
      params: { name },
      keywords: ['preset', 'load', name],
      group: 'preset',
      icon: Palette,
      run: () => {
        useSettingsStore.getState().applyPreset(presets[name])
        toast(globalT('toast.loadedPreset', { name }))
      }
    }))

    return [...base, ...presetCommands]
  }, [chunkMode, autoRefresh, inFlight, theme, locale, presets])

  return { groups: COMMAND_GROUPS, commands }
}