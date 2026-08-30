// ---------- Manage-presets dialog ----------
// Load / rename / delete saved presets. Renaming is done inline per row.
import { useState } from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { useI18n } from '@/i18n.ts'
import { usePresetsStore } from '@/stores/presets.ts'
import { useSettingsStore } from '@/stores/settings.ts'
import { useAppStore } from '@/stores/app.ts'
import { toast } from '@/composables/useToasts.ts'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@opengptdetect/ui'
import { Button } from '@opengptdetect/ui'
import { Input } from '@opengptdetect/ui'

export function ManagePresetsDialog() {
  const { t } = useI18n()
  const table = usePresetsStore((s) => s.presets)
  const closeModal = useAppStore((s) => s.closeModal)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  function loadPreset(name: string): void {
    useSettingsStore.getState().applyPreset(table[name])
    toast(t('toast.loadedPreset', { name }))
    closeModal()
  }

  function startRename(name: string): void {
    setRenameTarget(name)
    setRenameValue(name)
  }

  function commitRename(): void {
    const oldName = renameTarget
    if (!oldName) return
    const next = renameValue.trim()
    if (next && next !== oldName) usePresetsStore.getState().renamePresetByName(oldName, next)
    setRenameTarget(null)
  }

  function doDelete(name: string): void {
    usePresetsStore.getState().removePreset(name)
  }

  function modeLabel(mode: string): string {
    if (mode === 'token') return t('toolbar.chunkToken')
    if (mode === 'sentence') return t('toolbar.chunkSentence')
    if (mode === 'paragraph') return t('toolbar.chunkParagraph')
    return mode
  }

  const names = Object.keys(table)

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('modal.manage.title')}</DialogTitle>
          <DialogDescription>{t('modal.manage.hint')}</DialogDescription>
        </DialogHeader>

        {names.length > 0 ? (
          <div className="space-y-1.5">
            {names.map((name) => (
              <div key={name} className="flex items-center gap-2 rounded-md border px-3 py-2">
                {renameTarget === name ? (
                  <>
                    <Input
                      value={renameValue}
                      className="h-7 flex-1 text-sm"
                      autoFocus
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => e.key === 'Enter' && commitRename()}
                    />
                    <Button size="icon-xs" variant="ghost" onClick={commitRename}>
                      <Check className="size-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate text-sm">{name}</span>
                    {table[name]!.chunkMode && (
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                        {modeLabel(table[name]!.chunkMode)}
                      </span>
                    )}
                    <Button size="icon-sm" variant="ghost" title={t('modal.manage.load')} onClick={() => loadPreset(name)}>
                      <span className="text-xs">{t('modal.manage.load')}</span>
                    </Button>
                    <Button size="icon-sm" variant="ghost" title={t('modal.manage.rename')} onClick={() => startRename(name)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" title={t('modal.manage.delete')} onClick={() => doDelete(name)}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('modal.manage.empty')}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={closeModal}>{t('modal.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}