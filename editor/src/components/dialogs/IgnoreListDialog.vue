<script setup lang="ts">
// ---------- Ignore-list dialog ----------
// Lists every ignored span (preview + char count) with remove / clear-all.
import { computed } from 'vue'
import { Trash2 } from '@lucide/vue'
import { useI18n } from '../../i18n.ts'
import { useApp } from '../../composables/useApp.ts'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'

const { t } = useI18n()
const { getIgnores, documentText, removeIgnoreAt, clearIgnores, closeModal } = useApp()

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
  <Dialog :open="true" @update:open="(o) => !o && closeModal()">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t('modal.ignore.title') }}</DialogTitle>
        <DialogDescription>{{ t('modal.ignore.hint') }}</DialogDescription>
      </DialogHeader>

      <div v-if="rows.length" class="max-h-72 space-y-1.5 overflow-y-auto pr-1">
        <div
          v-for="row in rows"
          :key="row.index"
          class="ignore-row flex items-start gap-2 rounded-md border px-3 py-2"
        >
          <span class="flex-1 break-all font-mono text-xs text-foreground" :title="row.preview">
            “{{ row.short }}”
          </span>
          <span class="shrink-0 text-[11px] text-muted-foreground">{{ t('modal.ignore.chars', { n: row.range.end - row.range.start }) }}</span>
          <Button size="icon-sm" variant="ghost" :title="t('modal.ignore.remove')" @click="removeIgnoreAt(row.index)">
            <Trash2 class="size-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>
      <p v-else class="py-6 text-center text-sm text-muted-foreground">{{ t('modal.ignore.empty') }}</p>

      <DialogFooter class="gap-2">
        <Button variant="destructive" :disabled="!rows.length" @click="clearIgnores">
          {{ t('modal.ignore.clearAll') }}
        </Button>
        <Button variant="outline" @click="closeModal">{{ t('modal.close') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>