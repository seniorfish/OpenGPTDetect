<script setup lang="ts">
// ---------- Save-preset modal ----------
import { ref } from 'vue'
import { useI18n } from '../../i18n.ts'
import { presetFromSettings } from '../../composables/useSettings.ts'
import { upsertPreset } from '../../composables/usePresets.ts'
import { toast } from '../../composables/useToasts.ts'

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const name = ref('')

function save(): void {
  const trimmed = name.value.trim()
  if (!trimmed) {
    toast(t('modal.savePreset.emptyName'), 'warn')
    return
  }
  upsertPreset(presetFromSettings(trimmed))
  toast(t('modal.savePreset.saved', { name: trimmed }))
  emit('close')
}
</script>

<template>
  <div class="form-row">
    <label>{{ t('modal.savePreset.name') }}</label>
    <input
      id="preset-name" type="text"
      :value="name" :placeholder="t('modal.savePreset.placeholder')"
      @input="name = ($event.target as HTMLInputElement).value"
      @keydown.enter="save"
    />
  </div>
  <div class="form-actions">
    <button id="do-save" class="primary" @click="save">{{ t('modal.savePreset.do') }}</button>
  </div>
</template>