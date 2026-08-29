<script setup lang="ts">
// ---------- Generic modal primitive (overlay + header + slot) ----------
// Kept in components/ui so it can later be swapped for a component-library modal
// without touching the business modals that consume it.
import { useI18n } from '../../i18n.ts'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
</script>

<template>
  <div id="modal-overlay" class="modal-overlay" @mousedown.self="emit('close')">
    <div id="modal-box" class="modal">
      <div class="modal-head">
        <span>{{ title }}</span>
        <button class="modal-close" :title="t('modal.close')" @click="emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <slot />
      </div>
    </div>
  </div>
</template>