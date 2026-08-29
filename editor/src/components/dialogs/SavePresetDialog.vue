<script setup lang="ts">
// ---------- Save-preset dialog ----------
import { ref } from 'vue'
import { useI18n } from '../../i18n.ts'
import { presetFromSettings } from '../../composables/useSettings.ts'
import { upsertPreset } from '../../composables/usePresets.ts'
import { useApp } from '../../composables/useApp.ts'
import { toast } from '../../composables/useToasts.ts'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Input } from '../ui/input'

const { t } = useI18n()
const { closeModal } = useApp()

const name = ref('')

function save(): void {
  const trimmed = name.value.trim()
  if (!trimmed) {
    toast(t('modal.savePreset.emptyName'), 'warn')
    return
  }
  upsertPreset(presetFromSettings(trimmed))
  toast(t('modal.savePreset.saved', { name: trimmed }))
  closeModal()
}
</script>

<template>
  <Dialog :open="true" @update:open="(o) => !o && closeModal()">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t('modal.savePreset.title') }}</DialogTitle>
        <DialogDescription>{{ t('modal.savePreset.hint') }}</DialogDescription>
      </DialogHeader>
      <div class="space-y-2">
        <Label for="preset-name" class="text-xs text-muted-foreground">{{ t('modal.savePreset.name') }}</Label>
        <Input
          id="preset-name"
          :model-value="name"
          :placeholder="t('modal.savePreset.placeholder')"
          class="w-full"
          @update:model-value="name = String($event)"
          @keydown.enter="save"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" @click="closeModal">{{ t('modal.close') }}</Button>
        <Button id="do-save" @click="save">{{ t('modal.savePreset.do') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>