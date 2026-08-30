// ---------- Color-stop editor ----------
// ppl + color rows for the settings dialog. Mutates the settings store (copied
// arrays), which is persisted and re-renders the heat map immediately.
import { Plus, Trash2 } from 'lucide-react'
import { useI18n } from '@/i18n.ts'
import { useSettingsStore } from '@/stores/settings.ts'
import { toast } from '@/composables/useToasts.ts'
import { Button } from './button'
import { Input } from './input'
import type { ColorStop } from '@/types.ts'

export function ColorStopsEditor() {
  const stops = useSettingsStore((s) => s.settings.stops)
  const { t } = useI18n()

  function patchStops(next: ColorStop[]): void {
    useSettingsStore.getState().patchSettings({ stops: next })
  }

  function onPplCommit(index: number, value: string): void {
    // Commit on blur only, so typing "1" while editing "12" never re-sorts or
    // steals focus mid-edit.
    const n = Number(value)
    if (value.trim() === '' || Number.isNaN(n)) return
    const next = stops.map((s) => ({ ...s }))
    next[index]!.ppl = Math.max(0, n)
    next.sort((a, b) => a.ppl - b.ppl)
    patchStops(next)
  }

  function onColorChange(index: number, value: string): void {
    const next = stops.map((s) => ({ ...s }))
    next[index]!.color = value
    patchStops(next)
  }

  function onDelete(index: number): void {
    if (stops.length <= 1) {
      toast(t('toast.minStops'), 'warn')
      return
    }
    const next = stops.filter((_, i) => i !== index)
    patchStops(next)
  }

  function onAdd(): void {
    const last = stops[stops.length - 1]
    patchStops([...stops.map((s) => ({ ...s })), { ppl: (last ? last.ppl : 10) * 2, color: '#ef4444' }])
  }

  return (
    <div className="space-y-1.5">
      {stops.map((s, i) => (
        <div key={`${i}-${s.ppl}`} className="stop-row flex items-center gap-2 rounded-md border px-2 py-1.5">
          <span className="shrink-0 text-[11px] text-muted-foreground">{t('modal.settings.stopPpl')}</span>
          <Input
            type="number"
            defaultValue={s.ppl}
            min="0"
            step="0.01"
            className="h-7 w-20 text-sm"
            onBlur={(e) => onPplCommit(i, e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <span
            className="h-7 w-8 shrink-0 cursor-pointer overflow-hidden rounded-md border"
            style={{ backgroundColor: s.color }}
            title={s.color}
          >
            <input
              type="color"
              className="size-full cursor-pointer opacity-0"
              value={s.color}
              onChange={(e) => onColorChange(i, e.target.value)}
            />
          </span>
          <span className="flex-1 truncate font-mono text-[11px] text-muted-foreground">{s.color}</span>
          <Button size="icon-xs" variant="ghost" title={t('modal.settings.stopDeleteHint')} onClick={() => onDelete(i)}>
            <Trash2 className="size-3 text-muted-foreground" />
          </Button>
        </div>
      ))}
      <Button id="stop-add" variant="outline" size="sm" className="w-full" onClick={onAdd}>
        <Plus className="size-3.5" />
        {t('modal.settings.stopAdd')}
      </Button>
    </div>
  )
}