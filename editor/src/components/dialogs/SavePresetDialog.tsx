// ---------- Save-preset dialog ----------
import { useState } from 'react'
import { useI18n } from '@/i18n.ts'
import { useSettingsStore, presetFromSettings } from '@/stores/settings.ts'
import { usePresetsStore } from '@/stores/presets.ts'
import { useAppStore } from '@/stores/app.ts'
import { toast } from '@/composables/useToasts.ts'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

export function SavePresetDialog() {
  const { t } = useI18n()
  const closeModal = useAppStore((s) => s.closeModal)
  const [name, setName] = useState('')

  function save(): void {
    const trimmed = name.trim()
    if (!trimmed) {
      toast(t('modal.savePreset.emptyName'), 'warn')
      return
    }
    const settings = useSettingsStore.getState().settings
    usePresetsStore.getState().upsertPreset(presetFromSettings(settings, trimmed))
    toast(t('modal.savePreset.saved', { name: trimmed }))
    closeModal()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('modal.savePreset.title')}</DialogTitle>
          <DialogDescription>{t('modal.savePreset.hint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="preset-name" className="text-xs text-muted-foreground">{t('modal.savePreset.name')}</Label>
          <Input
            id="preset-name"
            value={name}
            placeholder={t('modal.savePreset.placeholder')}
            className="w-full"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeModal}>{t('modal.close')}</Button>
          <Button id="do-save" onClick={save}>{t('modal.savePreset.do')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}