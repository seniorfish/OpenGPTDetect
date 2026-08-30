// ---------- Color-stop editor (controlled, host-agnostic) ----------
// ppl + color rows for a settings dialog. Fully controlled: the host owns the
// value/onChange contract, the strings and the toast sink — no store, no i18n,
// no framework glue here. The editor and the extension options page both use it.
import { Plus, Trash2 } from 'lucide-react'
import { Button } from './button'
import { Input } from './input'
import type { ColorStop } from '@opengptdetect/core'

export interface ColorStopsEditorStrings {
  /** Label before the ppl number input, e.g. "ppl" / "困惑度". */
  pplLabel: string
  /** Tooltip of the delete button. */
  deleteHint: string
  /** Label of the "add stop" button. */
  addLabel: string
  /** Toast shown when deleting the last remaining stop. */
  minStopsToast: string
}

export interface ColorStopsEditorProps {
  value: ColorStop[]
  onChange: (next: ColorStop[]) => void
  strings: ColorStopsEditorStrings
  /** Optional toast sink (host supplies its own messenger). */
  toast?: (msg: string, kind?: 'warn' | 'error') => void
}

export function ColorStopsEditor({ value, onChange, strings, toast }: ColorStopsEditorProps) {
  const stops = value

  function onPplCommit(index: number, raw: string): void {
    // Commit on blur only, so typing "1" while editing "12" never re-sorts or
    // steals focus mid-edit.
    const n = Number(raw)
    if (raw.trim() === '' || Number.isNaN(n)) return
    const next = stops.map((s) => ({ ...s }))
    next[index]!.ppl = Math.max(0, n)
    next.sort((a, b) => a.ppl - b.ppl)
    onChange(next)
  }

  function onColorChange(index: number, value2: string): void {
    const next = stops.map((s) => ({ ...s }))
    next[index]!.color = value2
    onChange(next)
  }

  function onDelete(index: number): void {
    if (stops.length <= 1) {
      toast?.(strings.minStopsToast, 'warn')
      return
    }
    onChange(stops.filter((_, i) => i !== index))
  }

  function onAdd(): void {
    const last = stops[stops.length - 1]
    onChange([...stops.map((s) => ({ ...s })), { ppl: (last ? last.ppl : 10) * 2, color: '#ef4444' }])
  }

  return (
    <div className="space-y-1.5">
      {stops.map((s, i) => (
        <div key={`${i}-${s.ppl}`} className="stop-row flex items-center gap-2 rounded-md border px-2 py-1.5">
          <span className="shrink-0 text-[11px] text-muted-foreground">{strings.pplLabel}</span>
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
          <Button
            size="icon-xs"
            variant="ghost"
            title={strings.deleteHint}
            onClick={() => onDelete(i)}
          >
            <Trash2 className="size-3 text-muted-foreground" />
          </Button>
        </div>
      ))}
      <Button id="stop-add" variant="outline" size="sm" className="w-full" onClick={onAdd}>
        <Plus className="size-3.5" />
        {strings.addLabel}
      </Button>
    </div>
  )
}
