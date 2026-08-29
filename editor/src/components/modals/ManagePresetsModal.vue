<script setup lang="ts">
// ---------- Manage-presets modal: load / rename / delete ----------
import { ref } from 'vue'
import { useI18n } from '../../i18n.ts'
import { usePresetTable, removePreset, renamePresetByName } from '../../composables/usePresets.ts'
import { applyPreset } from '../../composables/useSettings.ts'
import { useApp } from '../../composables/useApp.ts'
import { toast } from '../../composables/useToasts.ts'

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const table = usePresetTable()
const { settingsChanged } = useApp()

const renameTarget = ref<string | null>(null)
const renameValue = ref('')

function loadPreset(name: string): void {
  applyPreset(table[name])
  settingsChanged()
  toast(t('toast.loadedPreset', { name }))
  emit('close')
}

function startRename(name: string): void {
  renameTarget.value = name
  renameValue.value = name
}

function commitRename(): void {
  const oldName = renameTarget.value
  if (!oldName) return
  const next = renameValue.value.trim()
  if (next && next !== oldName) renamePresetByName(oldName, next)
  renameTarget.value = null
}

function doDelete(name: string): void {
  removePreset(name)
}
</script>

<template>
  <div v-if="Object.keys(table).length" class="preset-list">
    <div v-for="(preset, name) in table" :key="name" class="preset-row" :data-name="name">
      <template v-if="renameTarget === name">
        <input
          type="text"
          :value="renameValue"
          @input="renameValue = ($event.target as HTMLInputElement).value"
          @blur="commitRename"
          @keydown.enter="commitRename"
        />
      </template>
      <span v-else class="preset-name">{{ name }}</span>
      <button @click="loadPreset(name)">{{ t('modal.manage.load') }}</button>
      <button @click="startRename(name)">{{ t('modal.manage.rename') }}</button>
      <button class="danger" @click="doDelete(name)">{{ t('modal.manage.delete') }}</button>
    </div>
  </div>
  <div v-else class="tip-dim">{{ t('modal.manage.empty') }}</div>
</template>