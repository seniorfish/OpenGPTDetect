// ---------- Settings dialog ----------
// Organized into sections; every field is one row in the DECLARATIVE `fields`
// array below (a future setting = one more row, no ad-hoc markup). Each row
// knows how to render its control and which settings key it mutates. Committing
// goes through `patchSettings`; the app store's settings subscription then
// fires the matching refresh (editor decoration / fonts / health probe), so no
// per-field commit hook is needed anymore.
import { useI18n, type MessageKey } from '@/i18n.ts'
import { useSettingsStore } from '@/stores/settings.ts'
import { useAppStore } from '@/stores/app.ts'
import { clamp } from '@/util.ts'
import type { HeatStyle } from '@/types.ts'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { ColorStopsEditor } from '@/components/ui/ColorStopsEditor'

type Field =
  | { kind: 'text'; key: 'serverUrl' | 'fontFamily'; labelKey: MessageKey; listId?: string }
  | { kind: 'select'; key: 'style'; labelKey: MessageKey; options: Array<{ value: HeatStyle; labelKey: MessageKey }> }
  | { kind: 'slider'; key: 'opacity'; labelKey: MessageKey }
  | { kind: 'number'; key: 'fontSize'; labelKey: MessageKey; min: number; max: number }

const fields: Field[] = [
  { kind: 'text', key: 'serverUrl', labelKey: 'modal.settings.backendUrl' },
  {
    kind: 'select', key: 'style', labelKey: 'modal.settings.style',
    options: [
      { value: 'background', labelKey: 'modal.settings.styleBackground' },
      { value: 'underline', labelKey: 'modal.settings.styleUnderline' }
    ]
  },
  { kind: 'slider', key: 'opacity', labelKey: 'modal.settings.opacity' },
  { kind: 'number', key: 'fontSize', labelKey: 'modal.settings.fontSize', min: 10, max: 32 },
  { kind: 'text', key: 'fontFamily', labelKey: 'modal.settings.fontFamily', listId: 'font-list' }
]

const FONT_CHOICES = [
  "'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif",
  "'Microsoft YaHei', sans-serif",
  'SimSun, serif',
  'KaiTi, serif',
  "Consolas, 'Courier New', monospace",
  'Georgia, serif'
]

export function SettingsDialog() {
  const { t } = useI18n()
  const settings = useSettingsStore((s) => s.settings)
  const closeModal = useAppStore((s) => s.closeModal)
  const patch = useSettingsStore((s) => s.patchSettings)

  const opacityPct = `${Math.round(settings.opacity * 100)}%`

  function onSelectChange(field: Field, value: string): void {
    if (field.kind === 'select') patch({ style: value as HeatStyle })
  }

  function onOpacityChange(value: number[] | undefined): void {
    patch({ opacity: clamp(value?.[0] ?? settings.opacity, 0.05, 1) })
  }

  function onNumberCommit(field: Field & { kind: 'number' }, value: string): void {
    // Commit on blur only: typing mid-edit must never be clamped/overwritten.
    const n = Number(value)
    if (value.trim() === '' || Number.isNaN(n)) return
    patch({ [field.key]: clamp(n, field.min, field.max) })
  }

  function onTextCommit(field: Field & { kind: 'text' }, value: string): void {
    const v = value.trim()
    if (!v) return
    patch({ [field.key]: v })
  }

  function resetStops(): void {
    useSettingsStore.getState().resetStops()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="sm:max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('modal.settings.title')}</DialogTitle>
          <DialogDescription>{t('modal.settings.hint')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          {/* Connection */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground">{t('settings.section.connection')}</h3>
            <FieldRow label={t('modal.settings.backendUrl')}>
              <Input
                id="set-url"
                type="text"
                defaultValue={settings.serverUrl}
                placeholder="http://127.0.0.1:8000"
                onBlur={(e) => onTextCommit(fields[0] as Field & { kind: 'text' }, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </FieldRow>
          </section>

          <Separator />

          {/* Rendering */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground">{t('settings.section.rendering')}</h3>
            <FieldRow label={t('modal.settings.style')}>
              <Select value={settings.style} onValueChange={(v) => onSelectChange(fields[1] as Field, v)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(fields[1] as Field & { kind: 'select' }).options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {t(o.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            {settings.style === 'background' && (
              <FieldRow label={t('modal.settings.opacity')}>
                <div className="flex items-center gap-3">
                  <Slider
                    id="set-opacity"
                    value={[settings.opacity]}
                    min={0.05}
                    max={1}
                    step={0.05}
                    className="max-w-52"
                    onValueChange={onOpacityChange}
                  />
                  <span id="opacity-val" className="w-10 text-xs tabular-nums text-foreground">{opacityPct}</span>
                </div>
              </FieldRow>
            )}
          </section>

          <Separator />

          {/* Editor */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground">{t('settings.section.editor')}</h3>
            <FieldRow label={t('modal.settings.fontSize')}>
              <Input
                id="set-font-size"
                type="number"
                defaultValue={settings.fontSize}
                min={10}
                max={32}
                step="1"
                className="w-24"
                onBlur={(e) => onNumberCommit(fields[3] as Field & { kind: 'number' }, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </FieldRow>
            <FieldRow label={t('modal.settings.fontFamily')}>
              <div className="flex items-center gap-2">
                <Input
                  id="set-font-family"
                  type="text"
                  defaultValue={settings.fontFamily}
                  list="font-list"
                  onBlur={(e) => onTextCommit(fields[4] as Field & { kind: 'text' }, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
                <datalist id="font-list">
                  {FONT_CHOICES.map((font) => (
                    <option key={font} value={font} />
                  ))}
                </datalist>
              </div>
            </FieldRow>
          </section>

          <Separator />

          {/* Colors */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground">{t('settings.section.colors')}</h3>
            <div className="grid grid-cols-[110px_1fr] items-start gap-3">
              <Label className="mt-1 text-right text-xs text-muted-foreground">
                {t('modal.settings.stops')}
                <p className="mt-0.5 font-normal normal-case leading-4">{t('modal.settings.stopsHint')}</p>
              </Label>
              <ColorStopsEditor />
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2">
          <Button id="stops-reset" variant="outline" onClick={resetStops}>
            {t('modal.settings.resetStops')}
          </Button>
          <Button variant="outline" onClick={closeModal}>{t('modal.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3">
      <Label className="text-right text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}