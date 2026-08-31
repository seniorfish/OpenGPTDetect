// ---------- Option-page building blocks (rows, labels) ----------
// Thin, declarative field rows shared by every settings page: each row knows
// how to render its control and which settings key it mutates. The rows consume
// the `switch`/`select`/`input` primitives from @opengptdetect/ui so the whole
// options page reads as one design system.
// NOTE: BoolRow renders without the Field wrapper (switch rows are self
// describing), so it has no `hint` slot.
import type { ReactNode } from 'react'
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@opengptdetect/ui'
import type { ExtensionSettings } from '@/lib/settings.ts'

/** Common props every settings page receives from the App shell. */
export interface PageProps {
  settings: ExtensionSettings
  patch: (p: Partial<ExtensionSettings>) => void
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="grid grid-cols-[220px_1fr] items-center gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div>
        {children}
        {hint && <p className="mt-1 text-xs text-muted-foreground/70">{hint}</p>}
      </div>
    </div>
  )
}

export function BoolRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-4 py-2.5">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export function NumberRow({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
}: {
  label: string
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        className="w-32"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    </Field>
  )
}

export function TextRow({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        className="w-full"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

export function TextAreaRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <Field label={label}>
      <textarea
        className="min-h-24 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs focus:border-ring focus:outline-none"
        value={value.join('\n')}
        onChange={(e) =>
          onChange(
            e.target.value
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
    </Field>
  )
}

export function SelectRow({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (next: string) => void
  hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="rounded-lg border bg-card p-4 shadow-sm">{children}</div>
    </div>
  )
}
