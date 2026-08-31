// ---------- Generic renderer for adapter-declared config fields ----------
// Maps an adapter's AdapterConfigField declarations onto the shared row
// components. Display uses the RESOLVED config (defaults visible); persistence
// stays sparse — a field the user never touches is never written.
import { pickLabel, type SupportedLocale } from '@/lib/i18n.ts'
import type {
  AdapterConfigField,
  AdapterConfigFieldValue,
  AdapterRuntimeConfig,
} from '@/lib/adapters/index.ts'
import { BoolRow, NumberRow, SelectRow, TextRow } from './shared.tsx'

export function AdapterConfigFields({
  fields,
  config,
  locale,
  onChange,
}: {
  fields: ReadonlyArray<AdapterConfigField>
  config: AdapterRuntimeConfig
  locale: SupportedLocale
  onChange: (key: string, value: AdapterConfigFieldValue) => void
}) {
  return (
    <>
      {fields.map((f) => {
        const label = pickLabel(locale, f.label)
        const hint = f.hint ? pickLabel(locale, f.hint) : undefined
        if (f.kind === 'boolean') {
          return (
            <div className="w-full" key={f.key}>
              <BoolRow
                label={label}
                checked={config[f.key] === true}
                onChange={(v) => onChange(f.key, v)}
              />
            </div>
          )
        }
        if (f.kind === 'number') {
          const v = config[f.key]
          return (
            <NumberRow
              key={f.key}
              label={label}
              hint={hint}
              min={f.min}
              max={f.max}
              step={f.step}
              value={typeof v === 'number' ? v : (f.default as number)}
              onChange={(n) => onChange(f.key, n)}
            />
          )
        }
        if (f.kind === 'select') {
          return (
            <SelectRow
              key={f.key}
              label={label}
              hint={hint}
              value={String(config[f.key] ?? f.default)}
              options={(f.options ?? []).map((o) => ({
                value: o.value,
                label: pickLabel(locale, o.label),
              }))}
              onChange={(v) => onChange(f.key, v)}
            />
          )
        }
        const s = config[f.key]
        return (
          <TextRow
            key={f.key}
            label={label}
            hint={hint}
            value={typeof s === 'string' ? s : String(f.default)}
            placeholder={f.placeholder ? pickLabel(locale, f.placeholder) : undefined}
            onChange={(v) => onChange(f.key, v)}
          />
        )
      })}
    </>
  )
}
