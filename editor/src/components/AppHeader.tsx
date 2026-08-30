// ---------- App header ----------
// Organizes every action into labeled zones (history / display / context /
// presets / appearance / actions). Menus and buttons are read out of the central
// command registry (`useCommands`) so the header can never drift from the
// Ctrl+K palette: a command added in commands.ts shows up in both places.
import {
  Check, ChevronsUpDown, Languages, ListFilter, Loader2, Monitor,
  Moon, Palette, Play, Search, Sun
} from 'lucide-react'
import { useI18n } from '@/i18n.ts'
import { useAppStore } from '@/stores/app.ts'
import { usePresetsStore } from '@/stores/presets.ts'
import { useSettingsStore } from '@/stores/settings.ts'
import { useCommands } from '@/commands.ts'
import { setLocale, type SupportedLocale } from '@/i18n.ts'
import { useTheme } from '@/theme.ts'
import { toast } from '@/composables/useToasts.ts'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import type { CommandDef } from '@/commands.ts'
import type { ChunkMode } from '@/types.ts'

export interface AppHeaderProps {
  onOpenPalette: () => void
}

export function AppHeader({ onOpenPalette }: AppHeaderProps) {
  const { t, locale } = useI18n()
  const inFlight = useAppStore((s) => s.inFlight)
  const ignoreCount = useAppStore((s) => s.ignoreCount)
  const hasSelection = useDocSelection()
  const analyze = useAppStore((s) => s.analyze)
  const chunkMode = useSettingsStore((s) => s.settings.chunkMode)
  const autoRefresh = useSettingsStore((s) => s.settings.autoRefresh)
  const presets = usePresetsStore((s) => s.presets)
  const { commands } = useCommands()
  const { theme, resolved } = useTheme()

  const byId = (id: string): CommandDef | undefined => commands.find((c) => c.id === id)
  const undo = byId('undo')
  const redo = byId('redo')
  const cmdIgnoreSelection = byId('ignoreSelection')
  const cmdIgnoreList = byId('ignoreList')
  const cmdSavePreset = byId('savePreset')
  const cmdManagePresets = byId('managePresets')
  const cmdThemeLight = byId('themeLight')
  const cmdThemeDark = byId('themeDark')
  const cmdThemeSystem = byId('themeSystem')
  const cmdSettings = byId('settings')

  const analyzeLabel = inFlight ? t('toolbar.analyzeBusy') : t('toolbar.analyze')
  const ThemeGlyph = resolved === 'dark' ? Moon : Sun

  function onChunkMode(value: unknown): void {
    if (value === 'token' || value === 'sentence' || value === 'paragraph') {
      useSettingsStore.getState().setChunkMode(value as ChunkMode)
    }
  }

  function onAutoRefresh(checked: boolean): void {
    useSettingsStore.getState().toggleAutoRefresh()
  }

  function loadPreset(name: string): void {
    useSettingsStore.getState().applyPreset(presets[name])
    toast(t('toast.loadedPreset', { name }))
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-1.5 border-b bg-background px-3">
      {/* Brand — links to the project repo; "PPL" wears the heat-map colors */}
      <a
        href="https://github.com/seniorfish/OpenGPTDetect"
        target="_blank"
        rel="noopener noreferrer"
        title="OpenGPTDetect · GitHub"
        className="mr-1 -ml-1 flex select-none flex-col items-start rounded-md px-1 py-1 font-display leading-tight transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-[15px] font-bold tracking-tight text-foreground">OpenGPTDetect</span>
        <span className="text-[11px] tracking-tight text-foreground/70">
          <span className="font-semibold tracking-tight">
            <span className="text-[#d85c50]">P</span>
            <span className="text-[#cf8a2c]">P</span>
            <span className="text-[#46976a]">L</span>
          </span>{' '}
          Editor
        </span>
      </a>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* History zone: undo / redo */}
      <div className="flex items-center gap-0.5">
        {[undo, redo].map(
          (cmd) =>
            cmd && (
              <Tooltip key={cmd.id} delayDuration={150}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" disabled={cmd.disabled} onClick={cmd.run}>
                    <cmd.icon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t(cmd.titleKey)}
                  {cmd.shortcut && <span className="ml-1 text-muted-foreground">{cmd.shortcut}</span>}
                </TooltipContent>
              </Tooltip>
            )
        )}
      </div>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Display zone: chunk granularity */}
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={chunkMode}
        onValueChange={onChunkMode}
        className="[&_[data-slot=toggle-group-item]]:px-2.5"
      >
        <ToggleGroupItem value="token">{t('toolbar.chunkToken')}</ToggleGroupItem>
        <ToggleGroupItem value="sentence">{t('toolbar.chunkSentence')}</ToggleGroupItem>
        <ToggleGroupItem value="paragraph">{t('toolbar.chunkParagraph')}</ToggleGroupItem>
      </ToggleGroup>

      {/* Auto-refresh */}
      <label className="ml-1.5 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground">
        <Switch checked={autoRefresh} onCheckedChange={onAutoRefresh} />
        <span className="hidden xl:inline">{t('toolbar.autoRefresh')}</span>
      </label>

      <div className="flex-1" />

      {/* Actions zone */}
      <div className="flex items-center gap-1">
        {/* Command palette */}
        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 px-2.5 text-muted-foreground" onClick={onOpenPalette}>
              <Search className="size-3.5" />
              <span className="hidden text-xs lg:inline">{t('palette.trigger')}</span>
              <span className="kbd">Ctrl K</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('header.commandHint')}</TooltipContent>
        </Tooltip>

        {/* Ignore */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ListFilter className="size-4" />
              <span className="hidden xl:inline">{t('header.ignore')}</span>
              {ignoreCount > 0 && (
                <Badge id="ignore-count" variant="secondary" className="size-4 justify-center rounded-full p-0 text-[10px] tabular-nums">
                  {ignoreCount}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{t('header.ignore')}</DropdownMenuLabel>
            <DropdownMenuItem disabled={!hasSelection} onSelect={() => cmdIgnoreSelection?.run()}>
              {cmdIgnoreSelection && <cmdIgnoreSelection.icon className="size-4" />}
              {cmdIgnoreSelection && t(cmdIgnoreSelection.titleKey)}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {ignoreCount === 0 ? (
              <DropdownMenuItem disabled className="text-muted-foreground">
                {t('header.ignoreEmpty')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => cmdIgnoreList?.run()}>
                <ListFilter className="size-4" />
                {t('header.ignoreListAction')} · {ignoreCount}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Presets */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <Palette className="size-4" />
              <span className="hidden xl:inline">{t('header.presets')}</span>
              <ChevronsUpDown className="size-3.5 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>{t('header.presets')}</DropdownMenuLabel>
            {Object.keys(presets).map((name) => (
              <DropdownMenuItem key={name} onSelect={() => loadPreset(name)}>
                <Palette className="size-4" />
                <span className="truncate">{name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => cmdSavePreset?.run()}>
              {cmdSavePreset && <cmdSavePreset.icon className="size-4" />}
              {cmdSavePreset && t(cmdSavePreset.titleKey)}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => cmdManagePresets?.run()}>
              {cmdManagePresets && <cmdManagePresets.icon className="size-4" />}
              {cmdManagePresets && t(cmdManagePresets.titleKey)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Appearance zone: language + theme + settings */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" title={t('header.langHint')}>
              <Languages className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => setLocale('zh')}>
              <Languages className="size-4" />
              中文
              {locale === 'zh' && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLocale('en')}>
              <Languages className="size-4" />
              English
              {locale === 'en' && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" title={t('header.themeHint')}>
              <ThemeGlyph className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>{t('header.theme')}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => cmdThemeLight?.run()}>
              {cmdThemeLight && <cmdThemeLight.icon className="size-4" />}
              {t('header.themeLight')}
              {cmdThemeLight?.active && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => cmdThemeDark?.run()}>
              {cmdThemeDark && <cmdThemeDark.icon className="size-4" />}
              {t('header.themeDark')}
              {cmdThemeDark?.active && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => cmdThemeSystem?.run()}>
              {cmdThemeSystem && <cmdThemeSystem.icon className="size-4" />}
              {t('header.themeSystem')}
              {cmdThemeSystem?.active && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" id="btn-settings" onClick={() => cmdSettings?.run()}>
              {cmdSettings && <cmdSettings.icon className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('header.settingsHint')}</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Primary action */}
        <Button
          id="btn-analyze"
          size="lg"
          className="ml-1 min-w-28 gap-2"
          disabled={inFlight}
          title={t('toolbar.analyzeHint')}
          onClick={() => void analyze(true)}
        >
          {inFlight ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {analyzeLabel}
        </Button>
      </div>
    </header>
  )
}

// Selection state is derived from the editor (doc truth), versioned by cursorTick.
function useDocSelection(): boolean {
  const cursorTick = useAppStore((s) => s.cursorTick)
  const ed = useAppStore.getState().editor
  return ed ? !ed.view.state.selection.main.empty : false
}