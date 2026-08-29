<script setup lang="ts">
// ---------- Ignore-list modal ----------
import { computed } from 'vue'
import { useI18n } from '../../i18n.ts'
import { useApp } from '../../composables/useApp.ts'

const { t } = useI18n()
const { getIgnores, documentText, removeIgnoreAt, clearIgnores } = useApp()

interface Row {
  index: number
  range: { start: number; end: number }
  short: string
  preview: string
}

const rows = computed<Row[]>(() => {
  const doc = documentText()
  return getIgnores().map((range, i) => {
    const preview = doc.slice(range.start, range.end).replace(/\n/g, '↵')
    const short = preview.length > 40 ? preview.slice(0, 40) + '…' : preview
    return { index: i, range, short, preview }
  })
})
</script>

<template>
  <div v-if="rows.length">
    <div v-for="row in rows" :key="row.index" class="ignore-row" :data-i="row.index">
      <span class="ignore-preview" :title="row.preview">「{{ row.short }}」</span>
      <span class="tip-dim">{{ t('modal.ignore.chars', { n: row.range.end - row.range.start }) }}</span>
      <button class="danger" @click="removeIgnoreAt(row.index)">{{ t('modal.ignore.remove') }}</button>
    </div>
    <div class="form-actions">
      <button id="ignore-clear" class="danger" @click="clearIgnores">{{ t('modal.ignore.clearAll') }}</button>
    </div>
  </div>
  <div v-else class="tip-dim">{{ t('modal.ignore.empty') }}</div>
</template>