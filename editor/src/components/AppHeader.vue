<script setup lang="ts">
// ---------- App header ----------
// Organizes every action into labeled zones (history / display / context /
// presets / appearance / actions). Menus and buttons are read out of the central
// command registry (`useCommands`) so the header can never drift from the
// Ctrl+K palette: a command added in commands.ts shows up in both places.
import { computed } from 'vue'
import {
  Activity, Check, ChevronsUpDown, Languages, ListFilter, Loader2, Monitor,
  Moon, Palette, Play, Search, Sun
} from '@lucide/vue'
import { useI18n } from '../i18n.ts'
import { useApp } from '../composables/useApp.ts'
import { usePresetTable } from '../composables/usePresets.ts'
import { settings, saveSettings, applyPreset } from '../composables/useSettings.ts'
import { useCommands, setChunkMode } from '../commands.ts'
import { useTheme } from '../theme.ts'
import { toast } from '../composables/useToasts.ts'
import { Button } from '../components/ui/button'
import { Separator } from '../components/ui/separator'
import { Switch } from '../components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator
} from '../components/ui/dropdown-menu'
import { Tooltip, TooltipTrigger, TooltipContent } from '../components/ui/tooltip'
import { Badge } from '../components/ui/badge'
import type { CommandDef } from '../commands.ts'
import type { ChunkMode } from '../types.ts'

const { t, locale } = useI18n()
const app = useApp()
const { state } = app
const presets = usePresetTable()
const { commands } = useCommands()
const { theme, resolved } = useTheme()

const byId = (id: string): CommandDef | undefined => commands.value.find((c) => c.id === id)
const undo = computed(() => byId('undo'))
const redo = computed(() => byId('redo'))
const cmdIgnoreSelection = computed(() => byId('ignoreSelection'))
const cmdIgnoreList = computed(() => byId('ignoreList'))
const cmdSavePreset = computed(() => byId('savePreset'))
const cmdManagePresets = computed(() => byId('managePresets'))
const cmdThemeLight = computed(() => byId('themeLight'))
const cmdThemeDark = computed(() => byId('themeDark'))
const cmdThemeSystem = computed(() => byId('themeSystem'))
const cmdSettings = computed(() => byId('settings'))

const emit = defineEmits<{ openPalette: [] }>()

const analyzeLabel = computed(() => (state.inFlight ? t('toolbar.analyzeBusy') : t('toolbar.analyze')))
const ignoreCount = computed(() => state.ignoreCount)
const themeGlyph = computed(() => {
  if (resolved.value === 'dark') return Moon
  return Sun
})

function onChunkMode(value: unknown): void {
  if (
    (value === 'token' || value === 'sentence' || value === 'paragraph')
  ) setChunkMode(value as ChunkMode)
}

function onAutoRefresh(checked: boolean): void {
  settings.autoRefresh = checked
  saveSettings()
  app.autoRefreshChanged(checked)
}

function loadPreset(name: string): void {
  applyPreset(presets[name])
  app.settingsChanged()
  toast(t('toast.loadedPreset', { name }))
}
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-1.5 border-b bg-background px-3">
    <!-- Brand -->
    <div class="mr-1 flex select-none items-center gap-2">
      <span class="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Activity class="size-4" />
      </span>
      <span class="text-sm font-semibold tracking-tight">PPL</span>
      <span class="hidden text-xs text-muted-foreground md:inline">Perplexity</span>
    </div>

    <Separator orientation="vertical" class="mx-1 h-5" />

    <!-- History zone: undo / redo -->
    <div class="flex items-center gap-0.5">
      <Tooltip v-for="cmd in [undo, redo]" :key="cmd!.id" :delay-duration="150">
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" :disabled="cmd!.disabled?.()" @click="cmd!.run()">
            <component :is="cmd!.icon" class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {{ t(cmd!.titleKey) }}
          <span v-if="cmd!.shortcut" class="ml-1 text-muted-foreground">{{ cmd!.shortcut }}</span>
        </TooltipContent>
      </Tooltip>
    </div>

    <Separator orientation="vertical" class="mx-1 h-5" />

    <!-- Display zone: chunk granularity -->
    <ToggleGroup
      type="single"
      :model-value="settings.chunkMode"
      variant="outline"
      size="sm"
      class="[&_[data-slot=toggle-group-item]]:px-2.5"
      @update:model-value="onChunkMode"
    >
      <ToggleGroupItem value="token">{{ t('toolbar.chunkToken') }}</ToggleGroupItem>
      <ToggleGroupItem value="sentence">{{ t('toolbar.chunkSentence') }}</ToggleGroupItem>
      <ToggleGroupItem value="paragraph">{{ t('toolbar.chunkParagraph') }}</ToggleGroupItem>
    </ToggleGroup>

    <!-- Auto-refresh -->
    <label class="ml-1.5 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground">
      <Switch :checked="settings.autoRefresh" @update:checked="onAutoRefresh" />
      <span class="hidden xl:inline">{{ t('toolbar.autoRefresh') }}</span>
    </label>

    <div class="flex-1" />

    <!-- Actions zone -->
    <div class="flex items-center gap-1">
      <!-- Command palette -->
      <Tooltip :delay-duration="150">
        <TooltipTrigger as-child>
          <Button variant="outline" size="sm" class="gap-1.5 px-2.5 text-muted-foreground" @click="emit('openPalette')">
            <Search class="size-3.5" />
            <span class="hidden text-xs lg:inline">{{ t('palette.trigger') }}</span>
            <span class="kbd">Ctrl K</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{{ t('header.commandHint') }}</TooltipContent>
      </Tooltip>

      <!-- Ignore -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="sm" class="gap-1.5">
            <ListFilter class="size-4" />
            <span class="hidden xl:inline">{{ t('header.ignore') }}</span>
            <Badge v-if="ignoreCount > 0" variant="secondary" id="ignore-count" class="size-4 justify-center rounded-full p-0 text-[10px] tabular-nums">
              {{ ignoreCount }}
            </Badge>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-56">
          <DropdownMenuLabel>{{ t('header.ignore') }}</DropdownMenuLabel>
          <DropdownMenuItem :disabled="!state.hasSelection" @select="cmdIgnoreSelection!.run()">
            <component :is="cmdIgnoreSelection!.icon" class="size-4" />
            {{ t(cmdIgnoreSelection!.titleKey) }}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem v-if="ignoreCount === 0" disabled class="text-muted-foreground">
            {{ t('header.ignoreEmpty') }}
          </DropdownMenuItem>
          <DropdownMenuItem v-else @select="cmdIgnoreList!.run()">
            <component :is="cmdIgnoreList!.icon" class="size-4" />
            {{ t('header.ignoreListAction') }} · {{ ignoreCount }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <!-- Presets -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="sm" class="gap-1.5">
            <Palette class="size-4" />
            <span class="hidden xl:inline">{{ t('header.presets') }}</span>
            <ChevronsUpDown class="size-3.5 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-64">
          <DropdownMenuLabel>{{ t('header.presets') }}</DropdownMenuLabel>
          <DropdownMenuItem
            v-for="name in Object.keys(presets)"
            :key="name"
            @select="loadPreset(name)"
          >
            <Palette class="size-4" />
            <span class="truncate">{{ name }}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem @select="cmdSavePreset!.run()">
            <component :is="cmdSavePreset!.icon" class="size-4" />
            {{ t(cmdSavePreset!.titleKey) }}
          </DropdownMenuItem>
          <DropdownMenuItem @select="cmdManagePresets!.run()">
            <component :is="cmdManagePresets!.icon" class="size-4" />
            {{ t(cmdManagePresets!.titleKey) }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" class="mx-0.5 h-5" />

      <!-- Appearance zone: language + theme + settings -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon" :title="t('header.langHint')">
            <Languages class="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-44">
          <DropdownMenuItem @select="locale = 'zh'">
            <Languages class="size-4" />
            中文
            <Check v-if="locale === 'zh'" class="ml-auto size-4" />
          </DropdownMenuItem>
          <DropdownMenuItem @select="locale = 'en'">
            <Languages class="size-4" />
            English
            <Check v-if="locale === 'en'" class="ml-auto size-4" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon" :title="t('header.themeHint')">
            <component :is="themeGlyph" class="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-44">
          <DropdownMenuLabel>{{ t('header.theme') }}</DropdownMenuLabel>
          <DropdownMenuItem @select="cmdThemeLight!.run()">
            <component :is="cmdThemeLight!.icon" class="size-4" />
            {{ t('header.themeLight') }}
            <Check v-if="cmdThemeLight!.active?.()" class="ml-auto size-4" />
          </DropdownMenuItem>
          <DropdownMenuItem @select="cmdThemeDark!.run()">
            <component :is="cmdThemeDark!.icon" class="size-4" />
            {{ t('header.themeDark') }}
            <Check v-if="cmdThemeDark!.active?.()" class="ml-auto size-4" />
          </DropdownMenuItem>
          <DropdownMenuItem @select="cmdThemeSystem!.run()">
            <component :is="cmdThemeSystem!.icon" class="size-4" />
            {{ t('header.themeSystem') }}
            <Check v-if="cmdThemeSystem!.active?.()" class="ml-auto size-4" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip :delay-duration="150">
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" id="btn-settings" data-testid="btn-settings" @click="cmdSettings!.run()">
            <component :is="cmdSettings!.icon" class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{{ t('header.settingsHint') }}</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" class="mx-0.5 h-5" />

      <!-- Primary action -->
      <Button
        id="btn-analyze"
        size="lg"
        class="ml-1 min-w-28 gap-2"
        :disabled="state.inFlight"
        :title="t('toolbar.analyzeHint')"
        @click="app.analyze(true)"
      >
        <Loader2 v-if="state.inFlight" class="size-4 animate-spin" />
        <Play v-else class="size-4" />
        {{ analyzeLabel }}
      </Button>
    </div>
  </header>
</template>