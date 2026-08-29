<script setup lang="ts">
// ---------- Color-stop editor: ppl + color rows for the settings modal ----------
// Mutates the shared reactive settings; the parent is notified via `change`
// so the editor decorations and derived stats can refresh.
import { useI18n } from '../../i18n.ts'
import { settings } from '../../composables/useSettings.ts'
import { toast } from '../../composables/useToasts.ts'

const emit = defineEmits<{ change: [] }>()
const { t } = useI18n()

function notifyChange(): void {
  emit('change')
}

function onPplChange(index: number, event: Event): void {
  settings.stops[index].ppl = Math.max(0, Number((event.target as HTMLInputElement).value) || 0)
  settings.stops.sort((a, b) => a.ppl - b.ppl)
  notifyChange()
}

function onColorChange(index: number, event: Event): void {
  settings.stops[index].color = (event.target as HTMLInputElement).value
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
  <div class="stops-editor">
    <div v-for="(s, i) in settings.stops" :key="`${i}-${s.ppl}`" class="stop-row" :data-i="i">
      <span class="tip-dim">{{ t('modal.settings.stopPpl') }}</span>
      <input
        type="number" class="stop-ppl" :value="s.ppl" min="0" step="0.01"
        @change="onPplChange(i, $event)"
      />
      <input
        type="color" class="stop-color" :value="s.color"
        @input="onColorChange(i, $event)"
      />
      <button class="stop-del danger" :title="t('modal.settings.stopDeleteHint')" @click="onDelete(i)">✕</button>
    </div>
    <button id="stop-add" @click="onAdd">{{ t('modal.settings.stopAdd') }}</button>
  </div>
</template>