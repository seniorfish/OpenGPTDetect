<script setup lang="ts">
// ---------- Settings dialog ----------
// Organized into sections; every field is one row in the DECLARATIVE `fields`
// array below (a future setting = one more row, no ad-hoc markup). Each row
// knows how to render its control, which settings key it mutates, and which
// refresh callback to fire (settings / font / server), exactly mirroring the
// historical change handlers.
import { computed } from 'vue'
import { useI18n } from '../../i18n.ts'
import { settings, saveSettings } from '../../composables/useSettings.ts'
import { useApp } from '../../composables/useApp.ts'
import { clamp } from '../../util.ts'
import type { HeatStyle } from '../../types.ts'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from '../ui/select'
import { Slider } from '../ui/slider'
import { Separator } from '../ui/separator'
import ColorStopsEditor from '../ui/ColorStopsEditor.vue'
import type { MessageKey } from '../../i18n.ts'

const { t } = useI18n()
const { settingsChanged, fontChanged, serverChanged, closeModal } = useApp()

const opacityPct = computed(() => String(Math.round(settings.opacity * 100)) + '%')

interface FieldBase {
  labelKey: MessageKey
  listId?: string
  commit: () => void
}

type Field =
  | (FieldBase & { kind: 'text'; key: 'serverUrl' | 'fontFamily' })
  | (FieldBase & { kind: 'select'; key: 'style'; options: Array<{ value: HeatStyle; labelKey: MessageKey }> })
  | (FieldBase & { kind: 'slider'; key: 'opacity'; display: () => string })
  | (FieldBase & { kind: 'number'; key: 'fontSize'; min: number; max: number })

const fields: Field[] = [
  {
    kind: 'text', key: 'serverUrl', labelKey: 'modal.settings.backendUrl',
    commit: () => serverChanged()
  },
  {
    kind: 'select', key: 'style', labelKey: 'modal.settings.style',
    options: [
      { value: 'background', labelKey: 'modal.settings.styleBackground' },
      { value: 'underline', labelKey: 'modal.settings.styleUnderline' },
      { value: 'both', labelKey: 'modal.settings.styleBoth' }
    ],
    commit: () => settingsChanged()
  },
  {
    kind: 'slider', key: 'opacity', labelKey: 'modal.settings.opacity',
    display: () => opacityPct.value,
    commit: () => settingsChanged()
  },
  {
    kind: 'number', key: 'fontSize', labelKey: 'modal.settings.fontSize', min: 10, max: 32,
    commit: () => fontChanged()
  },
  {
    kind: 'text', key: 'fontFamily', labelKey: 'modal.settings.fontFamily', listId: 'font-list',
    commit: () => fontChanged()
  }
]

/** Persist a bound value read back from a native event target. */
function commitNative(field: Field, event: Event): void {
  const target = event.target as HTMLInputElement
  if (field.kind === 'number') {
    settings.fontSize = clamp(Number(target.value) || 16, field.min, field.max)
  } else if (field.kind === 'text') {
    const v = target.value.trim()
    if (!v) return
    if (field.key === 'serverUrl') settings.serverUrl = v
    else settings.fontFamily = v
  } else {
    return
  }
  saveSettings()
  field.commit()
}

function onSelectChange(field: Field, value: unknown): void {
  if (field.kind !== 'select' || typeof value !== 'string') return
  settings.style = value as HeatStyle
  saveSettings()
  field.commit()
}

function onOpacityChange(value: number[] | undefined): void {
  settings.opacity = clamp(value?.[0] ?? settings.opacity, 0.05, 1)
  saveSettings()
  settingsChanged()
}

const FONT_CHOICES = [
  "'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif",
  "'Microsoft YaHei', sans-serif",
  'SimSun, serif',
  'KaiTi, serif',
  "Consolas, 'Courier New', monospace",
  'Georgia, serif'
]

function onStopChange(): void {
  saveSettings()
  settingsChanged()
}

function resetStops(): void {
  settings.stops = [
    { ppl: 12, color: '#22c55e' },
    { ppl: 18, color: '#eab308' },
    { ppl: 50, color: '#ef4444' },
    { ppl: 100, color: '#7f1d1d' }
  ]
  saveSettings()
  settingsChanged()
}
</script>

<template>
  <Dialog :open="true" @update:open="(o) => !o && closeModal()">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ t('modal.settings.title') }}</DialogTitle>
        <DialogDescription>{{ t('modal.settings.hint') }}</DialogDescription>
      </DialogHeader>

      <div class="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
        <!-- Connection -->
        <section class="space-y-2">
          <h3 class="text-xs font-semibold text-muted-foreground">{{ t('settings.section.connection') }}</h3>
          <template v-for="f in fields.filter((f) => f.key === 'serverUrl')" :key="f.key">
            <div class="grid grid-cols-[110px_1fr] items-center gap-3">
              <Label class="text-right text-xs text-muted-foreground">{{ t(f.labelKey) }}</Label>
              <Input
                id="set-url"
                type="text"
                :model-value="settings.serverUrl"
                placeholder="http://127.0.0.1:8000"
                @change="commitNative(f, $event)"
                @keydown.enter="(e: KeyboardEvent) => (e.target as HTMLInputElement).blur()"
              />
            </div>
          </template>
        </section>

        <Separator />

        <!-- Rendering -->
        <section class="space-y-2">
          <h3 class="text-xs font-semibold text-muted-foreground">{{ t('settings.section.rendering') }}</h3>
          <template v-for="f in fields.filter((f2) => f2.key === 'style' || f2.key === 'opacity')" :key="f.key">
            <div class="grid grid-cols-[110px_1fr] items-center gap-3">
              <Label class="text-right text-xs text-muted-foreground">{{ t(f.labelKey) }}</Label>
              <template v-if="f.kind === 'select'">
                <Select :model-value="settings.style" @update:model-value="(v) => onSelectChange(f, v)">
                  <SelectTrigger class="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="o in f.options" :key="o.value" :value="o.value">
                      {{ t(o.labelKey) }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </template>
              <template v-else-if="f.kind === 'slider'">
                <div class="flex items-center gap-3">
                  <Slider
                    id="set-opacity"
                    :model-value="[settings.opacity]"
                    :min="0.05"
                    :max="1"
                    :step="0.05"
                    class="max-w-52"
                    @update:model-value="onOpacityChange"
                  />
                  <span id="opacity-val" class="w-10 text-xs tabular-nums text-foreground">{{ f.display() }}</span>
                </div>
              </template>
            </div>
          </template>
        </section>

        <Separator />

        <!-- Editor -->
        <section class="space-y-2">
          <h3 class="text-xs font-semibold text-muted-foreground">{{ t('settings.section.editor') }}</h3>
          <template v-for="f in fields.filter((x): x is typeof x => x.key === 'fontSize' || x.key === 'fontFamily')" :key="f.key">
            <div class="grid grid-cols-[110px_1fr] items-center gap-3">
              <Label class="text-right text-xs text-muted-foreground">{{ t(f.labelKey) }}</Label>
              <template v-if="f.kind === 'number'">
                <Input
                  id="set-font-size"
                  type="number"
                  :model-value="settings.fontSize"
                  :min="f.min"
                  :max="f.max"
                  step="1"
                  class="w-24"
                  @change="commitNative(f, $event)"
                  @keydown.enter="(e: KeyboardEvent) => (e.target as HTMLInputElement).blur()"
                />
              </template>
              <template v-else>
                <div class="flex items-center gap-2">
                  <Input
                    id="set-font-family"
                    type="text"
                    :model-value="settings.fontFamily"
                    :list="f.listId"
                    @change="commitNative(f, $event)"
                    @keydown.enter="(e: KeyboardEvent) => (e.target as HTMLInputElement).blur()"
                  />
                  <datalist id="font-list">
                    <option v-for="font in FONT_CHOICES" :key="font" :value="font"></option>
                  </datalist>
                </div>
              </template>
            </div>
          </template>
        </section>

        <Separator />

        <!-- Colors -->
        <section class="space-y-2">
          <h3 class="text-xs font-semibold text-muted-foreground">{{ t('settings.section.colors') }}</h3>
          <div class="grid grid-cols-[110px_1fr] items-start gap-3">
            <Label class="mt-1 text-right text-xs text-muted-foreground">
              {{ t('modal.settings.stops') }}
              <p class="mt-0.5 font-normal normal-case leading-4">{{ t('modal.settings.stopsHint') }}</p>
            </Label>
            <ColorStopsEditor @change="onStopChange" />
          </div>
        </section>
      </div>

      <DialogFooter class="gap-2">
        <Button id="stops-reset" variant="outline" @click="resetStops">{{ t('modal.settings.resetStops') }}</Button>
        <Button variant="secondary" @click="closeModal">{{ t('modal.close') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>