// ---------- Ignore-list dialog ----------
// Lists every ignored span (preview + char count) with remove / clear-all.
// Rows are derived from the editor's doc + ignores; re-derived on drawTick.
import { useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { useI18n } from '@/i18n.ts'
import { useAppStore } from '@/stores/app.ts'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Row {
  index: number
  range: { start: number; end: number }
  short: string
  preview: string
}

export function IgnoreListDialog() {
  const { t } = useI18n()
  const closeModal = useAppStore((s) => s.closeModal)
  const drawTick = useAppStore((s) => s.drawTick)

  const rows = useMemo<Row[]>(() => {
    const app = useAppStore.getState()
    const doc = app.documentText()
    return app.getIgnores().map((range, i) => {
      const preview = doc.slice(range.start, range.end).replace(/\n/g, '↵')
      const short = preview.length > 40 ? preview.slice(0, 40) + '…' : preview
      return { index: i, range, short, preview }
    })
  }, [drawTick])

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('modal.ignore.title')}</DialogTitle>
          <DialogDescription>{t('modal.ignore.hint')}</DialogDescription>
        </DialogHeader>

        {rows.length > 0 ? (
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {rows.map((row) => (
              <div key={row.index} className="ignore-row flex items-start gap-2 rounded-md border px-3 py-2">
                <span className="flex-1 break-all font-mono text-xs text-foreground" title={row.preview}>
                  {`“${row.short}”`}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {t('modal.ignore.chars', { n: row.range.end - row.range.start })}
                </span>
                <Button size="icon-sm" variant="ghost" title={t('modal.ignore.remove')} onClick={() => useAppStore.getState().removeIgnoreAt(row.index)}>
                  <Trash2 className="size-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('modal.ignore.empty')}</p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="destructive" disabled={!rows.length} onClick={() => useAppStore.getState().clearIgnores()}>
            {t('modal.ignore.clearAll')}
          </Button>
          <Button variant="outline" onClick={closeModal}>{t('modal.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}