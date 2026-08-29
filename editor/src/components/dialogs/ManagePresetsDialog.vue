<script setup lang="ts">
// ---------- Manage-presets dialog ----------
// Load / rename / delete saved presets. Renaming is done inline per row.
import { ref } from 'vue'
import { Check, Pencil, Trash2 } from '@lucide/vue'
import { useI18n } from '../../i18n.ts'
import { usePresetTable, removePreset, renamePresetByName } from '../../composables/usePresets.ts'
import { applyPreset } from '../../composables/useSettings.ts'
import { useApp } from '../../composables/useApp.ts'
import { toast } from '../../composables/useToasts.ts'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

const { t } = useI18n()
const table = usePresetTable()
const { settingsChanged, closeModal } = useApp()

const renameTarget = ref<string | null>(null)
const renameValue = ref('')

function loadPreset(name: string): void {
  applyPreset(table[name])
  settingsChanged()
  toast(t('toast.loadedPreset', { name }))
  closeModal()
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

function modeLabel(mode: string): string {
  if (mode === 'token') return t('toolbar.chunkToken')
  if (mode === 'sentence') return t('toolbar.chunkSentence')
  if (mode === 'paragraph') return t('toolbar.chunkParagraph')
  return mode
}
</script>

<template>
  <Dialog :open="true" @update:open="(o) => !o && closeModal()">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t('modal.manage.title') }}</DialogTitle>
        <DialogDescription>{{ t('modal.manage.hint') }}</DialogDescription>
      </DialogHeader>

      <div v-if="Object.keys(table).length" class="space-y-1.5">
        <div v-for="(preset, name) in table" :key="name" class="flex items-center gap-2 rounded-md border px-3 py-2">
          <template v-if="renameTarget === name">
            <Input
              :model-value="renameValue"
              class="h-7 flex-1 text-sm"
              autofocus
              @update:model-value="renameValue = String($event)"
              @blur="commitRename"
              @keydown.enter="commitRename"
            />
            <Button size="icon-xs" variant="ghost" @click="commitRename">
              <Check class="size-3.5" />
            </Button>
          </template>
          <template v-else>
            <span class="flex-1 truncate text-sm">{{ name }}</span>
            <span v-if="preset.chunkMode" class="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
              {{ modeLabel(preset.chunkMode) }}
            </span>
            <Button size="icon-sm" variant="ghost" :title="t('modal.manage.load')" @click="loadPreset(name)">
              <span class="text-xs">{{ t('modal.manage.load') }}</span>
            </Button>
            <Button size="icon-sm" variant="ghost" :title="t('modal.manage.rename')" @click="startRename(name)">
              <Pencil class="size-3.5" />
            </Button>
            <Button size="icon-sm" variant="ghost" :title="t('modal.manage.delete')" @click="doDelete(name)">
              <Trash2 class="size-3.5 text-destructive" />
            </Button>
          </template>
        </div>
      </div>
      <p v-else class="py-6 text-center text-sm text-muted-foreground">{{ t('modal.manage.empty') }}</p>

      <DialogFooter>
        <Button variant="outline" @click="closeModal">{{ t('modal.close') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>