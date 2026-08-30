// ---------- App header ----------
// Three balanced zones, one visual language:
//   left   = brand + display granularity
//   center = command palette (the hub, keeps a Ctrl+K kbd) + settings
//   right  = context (ignore/presets) | appearance (lang/theme) | auto + Analyze
// Every "open a menu" entry is an icon-only ghost button with a tooltip — no
// width-dependent labels, so the bar never reshapes between breakpoints.
// Undo/redo stay reachable via the palette's edit group and Ctrl+Z / Ctrl+Y.
import {
  Check, Languages, ListFilter, Loader2, Moon, Palette, Play, Search, Sun
} from 'lucide-react'
import { useI18n } from '@/i18n.ts'
import { useAppStore } from '@/stores/app.ts'
import { usePresetsStore } from '@/stores/presets.ts'
import { useSettingsStore } from '@/stores/settings.ts'
import { useCommands } from '@/commands.ts'
import { setLocale } from '@/i18n.ts'
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
  const { resolved } = useTheme()

  const byId = (id: string): CommandDef | undefined => commands.find((c) => c.id === id)
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

  function loadPreset(name: string): void {
    useSettingsStore.getState().applyPreset(presets[name])
    toast(t('toast.loadedPreset', { name }))
  }

  return (
    <header className="flex h-14 shrink-0 items-center border-b bg-background px-3">
      {/* ===== Left zone: brand + display granularity ===== */}
      <div className="flex min-w-0 items-center gap-1.5">
        <a
          href="https://github.com/seniorfish/OpenGPTDetect"
          target="_blank"
          rel="noopener noreferrer"
          title="OpenGPTDetect · GitHub"
          className="-ml-1 flex select-none flex-col items-start rounded-md px-1 py-1 font-display leading-tight transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
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
      </div>

      {/* ===== Center zone: command palette + settings (balanced spacers) ===== */}
      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="w-44 justify-between gap-2 px-2.5 text-muted-foreground" onClick={onOpenPalette}>
              <span className="flex items-center gap-1.5">
                <Search className="size-4" />
                <span className="hidden text-xs lg:inline">{t('palette.trigger')}</span>
              </span>
              <span className="kbd">Ctrl K</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('header.commandHint')}</TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" id="btn-settings" onClick={() => cmdSettings?.run()}>
              {cmdSettings && <cmdSettings.icon className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('header.settingsHint')}</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex-1" />

      {/* ===== Right zone: context | appearance | auto + Analyze ===== */}
      <div className="flex items-center gap-0.5">
        {/* Ignore */}
        <DropdownMenu modal={false}>
          <Tooltip delayDuration={150}>
            <DropdownMenuTrigger asChild>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <ListFilter className="size-4" />
                  {ignoreCount > 0 && (
                    <Badge id="ignore-count" variant="secondary" className="absolute right-0.5 top-0.5 size-4 justify-center rounded-full p-0 text-[10px] tabular-nums">
                      {ignoreCount}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
            </DropdownMenuTrigger>
            <TooltipContent side="bottom">{t('header.ignore')}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
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
        <DropdownMenu modal={false}>
          <Tooltip delayDuration={150}>
            <DropdownMenuTrigger asChild>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Palette className="size-4" />
                </Button>
              </TooltipTrigger>
            </DropdownMenuTrigger>
            <TooltipContent side="bottom">{t('header.presets')}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-64" onCloseAutoFocus={(e) => e.preventDefault()}>
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

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Appearance zone: language + theme */}
        <DropdownMenu modal={false}>
          <Tooltip delayDuration={150}>
            <DropdownMenuTrigger asChild>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Languages className="size-4" />
                </Button>
              </TooltipTrigger>
            </DropdownMenuTrigger>
            <TooltipContent side="bottom">{t('header.langHint')}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-44" onCloseAutoFocus={(e) => e.preventDefault()}>
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

        <DropdownMenu modal={false}>
          <Tooltip delayDuration={150}>
            <DropdownMenuTrigger asChild>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon">
                  <ThemeGlyph className="size-4" />
                </Button>
              </TooltipTrigger>
            </DropdownMenuTrigger>
            <TooltipContent side="bottom">{t('header.themeHint')}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-44" onCloseAutoFocus={(e) => e.preventDefault()}>
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

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Auto-refresh next to the primary action */}
        <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
          <Switch checked={autoRefresh} onCheckedChange={() => useSettingsStore.getState().toggleAutoRefresh()} />
          <span>{t('toolbar.autoRefresh')}</span>
        </label>

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