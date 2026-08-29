<script setup lang="ts">
// ---------- Color-stop editor ----------
// ppl + color rows for the settings dialog. Mutates the shared reactive settings;
// the parent is notified via `change` so decorations and stats refresh.
import { Plus, Trash2 } from '@lucide/vue'
import { useI18n } from '../../i18n.ts'
import { settings } from '../../composables/useSettings.ts'
import { toast } from '../../composables/useToasts.ts'
import { Button } from './button'
import { Input } from './input'

const emit = defineEmits<{ change: [] }>()

const { t } = useI18n()

function notifyChange(): void {
  emit('change')
}

function onPplChange(index: number, value: string): void {
  settings.stops[index].ppl = Math.max(0, Number(value) || 0)
  settings.stops.sort((a, b) => a.ppl - b.ppl)
  notifyChange()
}

function onColorChange(index: number, value: string): void {
  settings.stops[index].color = value
  notifyChange()
}

function onDelete(index: number): void {
  if (settings.stops.length <= 1) {
    toast(t('toast.minStops'), 'warn')
    return
  }
  settings.stops.splice(index, 1)
  notifyChange()
}

function onAdd(): void {
  const last = settings.stops[settings.stops.length - 1]
  settings.stops.push({ ppl: (last ? last.ppl : 10) * 2, color: '#ef4444' })
  notifyChange()
}
</script>

<template>
  <div class="space-y-1.5">
    <div
      v-for="(s, i) in settings.stops"
      :key="`${i}-${s.ppl}`"
      class="stop-row flex items-center gap-2 rounded-md border px-2 py-1.5"
    >
      <span class="shrink-0 text-[11px] text-muted-foreground">{{ t('modal.settings.stopPpl') }}</span>
      <Input
        type="number"
        :model-value="s.ppl"
        min="0"
        step="0.01"
        class="h-7 w-20 text-sm"
        @update:model-value="onPplChange(i, String($event))"
      />
      <span
        class="h-7 w-8 shrink-0 cursor-pointer overflow-hidden rounded-md border"
        :style="{ backgroundColor: s.color }"
        :title="s.color"
      >
        <input
          type="color"
          class="size-full cursor-pointer opacity-0"
          :value="s.color"
          @input="onColorChange(i, ($event.target as HTMLInputElement).value)"
        />
      </span>
      <span class="flex-1 truncate font-mono text-[11px] text-muted-foreground">{{ s.color }}</span>
      <Button size="icon-xs" variant="ghost" :title="t('modal.settings.stopDeleteHint')" @click="onDelete(i)">
        <Trash2 class="size-3 text-muted-foreground" />
      </Button>
    </div>
    <Button id="stop-add" variant="outline" size="sm" class="w-full" @click="onAdd">
      <Plus class="size-3.5" />
      {{ t('modal.settings.stopAdd') }}
    </Button>
  </div>
</template>