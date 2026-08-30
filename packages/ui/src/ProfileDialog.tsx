// ---------- Profile export dialog (controlled, host-agnostic) ----------
// Turns a host's current color stops + a few metadata fields into a shareable
// PPL profile JSON. The host owns open state, the strings and the onExport
// sink (download / storage); validation reuses core's Zod schema so nothing
// invalid can leave the dialog.
import { useMemo, useState } from 'react'
import {
  parseProfile,
  profileIssues,
  type ColorStop,
  type Guideline,
  type PplScaleProfile,
} from '@opengptdetect/core'
import { Button } from './button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'
import { Input } from './input'
import { Label } from './label'

export interface ProfileDialogStrings {
  title: string
  hint: string
  nameLabel: string
  idLabel: string
  scopeLabel: string
  guidelineLabel: string
  aiLikeLabel: string
  humanLikeLabel: string
  hardPplLabel: string
  cancelLabel: string
  exportLabel: string
  invalidHint: string
}

export interface ProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Current color stops to package into the exported profile. */
  stops: ColorStop[]
  strings: ProfileDialogStrings
  onExport: (profile: PplScaleProfile) => void
  /** Prefilled guideline thresholds (the host's recommended classification lines). */
  defaultGuideline?: Guideline
}

function slug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9一-龥-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function ProfileDialog({
  open,
  onOpenChange,
  stops,
  strings,
  onExport,
  defaultGuideline = { aiLikePplMax: 18, humanLikePplMin: 35, hardPplMin: 50 },
}: ProfileDialogProps) {
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [scope, setScope] = useState('')
  const [guideline, setGuideline] = useState<Guideline>(defaultGuideline)

  function reset(): void {
    setName('')
    setId('')
    setScope('')
    setGuideline(defaultGuideline)
  }

  const draft: PplScaleProfile | null = useMemo(() => {
    const candidate = {
      schemaVersion: 1 as const,
      id: id.trim() || slug(name),
      name: name.trim(),
      scope: scope.trim(),
      scale: { mode: 'linear' as const, stops },
      guideline,
    }
    try {
      return parseProfile(candidate)
    } catch {
      return null
    }
  }, [name, id, scope, stops, guideline])

  const issues = useMemo(
    () =>
      draft
        ? []
        : profileIssues({
            id: id.trim() || slug(name),
            name: name.trim(),
            scope: scope.trim(),
            scale: { mode: 'linear', stops },
            guideline,
          }),
    [draft, name, id, scope, stops, guideline],
  )

  function onNameChange(value: string): void {
    setName(value)
    // Auto-derive the id until the user edits it manually.
    setId((prev) => (prev === slug(name) ? slug(value) : prev))
  }

  function exportProfile(): void {
    if (!draft) return
    onExport(draft)
    onOpenChange(false)
    reset()
  }

  const num = (v: number): string => String(v)
  const parseNum = (s: string, fallback: number): number => {
    const n = Number(s)
    return Number.isFinite(n) ? n : fallback
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{strings.title}</DialogTitle>
          <DialogDescription>{strings.hint}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-[6rem_1fr] items-center gap-3">
            <Label className="text-right text-xs text-muted-foreground">{strings.nameLabel}</Label>
            <Input value={name} onChange={(e) => onNameChange(e.target.value)} />
          </div>
          <div className="grid grid-cols-[6rem_1fr] items-center gap-3">
            <Label className="text-right text-xs text-muted-foreground">{strings.idLabel}</Label>
            <Input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder={slug(name) || undefined}
            />
          </div>
          <div className="grid grid-cols-[6rem_1fr] items-center gap-3">
            <Label className="text-right text-xs text-muted-foreground">{strings.scopeLabel}</Label>
            <Input value={scope} onChange={(e) => setScope(e.target.value)} />
          </div>

          <div className="grid grid-cols-[6rem_1fr] items-center gap-3">
            <Label className="text-right text-xs text-muted-foreground">
              {strings.guidelineLabel}
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{strings.aiLikeLabel}</span>
              <Input
                className="w-20"
                type="number"
                step="0.5"
                value={num(guideline.aiLikePplMax)}
                onChange={(e) =>
                  setGuideline({
                    ...guideline,
                    aiLikePplMax: parseNum(e.target.value, guideline.aiLikePplMax),
                  })
                }
              />
              <span className="text-[11px] text-muted-foreground">{strings.humanLikeLabel}</span>
              <Input
                className="w-20"
                type="number"
                step="0.5"
                value={num(guideline.humanLikePplMin)}
                onChange={(e) =>
                  setGuideline({
                    ...guideline,
                    humanLikePplMin: parseNum(e.target.value, guideline.humanLikePplMin),
                  })
                }
              />
              <span className="text-[11px] text-muted-foreground">{strings.hardPplLabel}</span>
              <Input
                className="w-20"
                type="number"
                step="0.5"
                value={num(guideline.hardPplMin)}
                onChange={(e) =>
                  setGuideline({
                    ...guideline,
                    hardPplMin: parseNum(e.target.value, guideline.hardPplMin),
                  })
                }
              />
            </div>
          </div>

          {issues.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {strings.invalidHint}
              <ul className="mt-1 list-inside list-disc">
                {issues.slice(0, 4).map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {strings.cancelLabel}
          </Button>
          <Button disabled={!draft} onClick={exportProfile}>
            {strings.exportLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
