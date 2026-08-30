// ---------- Block detail popover (floating UI, Rendered inside a ShadowRoot) ----------
// The annotation layer (label spans) lives in the page document, so the popover
// cannot use a Radix Trigger: the anchor is a fixed-position phantom span whose
// rect mirrors the clicked block, and the content portals back into the shadow
// root container (portalTarget) so the injected WXT styles apply to it.
import { useEffect, useSyncExternalStore } from 'react'
import { RefreshCwIcon, XIcon } from 'lucide-react'
import { Badge, Button, Popover, PopoverAnchor, PopoverContent } from '@opengptdetect/ui'
import { t, useLocale } from '../lib/i18n.ts'

export type AiVerdict = 'ai' | 'human' | 'uncertain' | 'unknown'

export interface BlockDetailInput {
  avgPpl: number | null
  avgNll: number | null
  charCount: number
  tokenCount: number
  lang: 'zh' | 'en'
  profileId: string
  verdict: AiVerdict
  error: string | null
  onRemeasure: (() => void) | null
}

export interface BlockDetail extends BlockDetailInput {
  key: number
  rect: { left: number; top: number; width: number; height: number }
}

// ----- tiny external store (useSyncExternalStore) so the vanilla content
// script can drive the React view without a state library.
let current: BlockDetail | null = null
let keyCounter = 0
const listeners = new Set<() => void>()

export function setDetail(
  input: BlockDetailInput | null,
  rect?: { left: number; top: number; width: number; height: number },
): void {
  current = input && rect ? { ...input, rect, key: ++keyCounter } : null
  for (const l of listeners) l()
}

export function getDetail(): BlockDetail | null {
  return current
}

export function subscribeDetail(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function verdictText(verdict: AiVerdict): string {
  switch (verdict) {
    case 'ai':
      return t('floating.verdictAi')
    case 'human':
      return t('floating.verdictHuman')
    case 'uncertain':
      return t('floating.verdictUncertain')
    default:
      return t('floating.verdictNone')
  }
}

function VerdictBadge({ verdict }: { verdict: AiVerdict }) {
  const variant = verdict === 'ai' ? 'destructive' : verdict === 'human' ? 'default' : 'outline'
  return <Badge variant={variant}>{verdictText(verdict)}</Badge>
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  )
}

export function BlockDetailPopover({
  portalTarget,
  onDismiss,
}: {
  portalTarget: HTMLElement
  /** Called whenever the popover should disappear (any close path except a re-open). */
  onDismiss: () => void
}) {
  const detail = useSyncExternalStore(subscribeDetail, getDetail)
  void useLocale() // re-render all strings when the UI language changes

  // The anchor rect is fixed-positioned; any scroll invalidates it -> close.
  useEffect(() => {
    if (!detail) return
    window.addEventListener('scroll', onDismiss, { capture: true, passive: true })
    return () => window.removeEventListener('scroll', onDismiss, { capture: true })
  }, [detail, onDismiss])

  if (!detail) return null

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) onDismiss()
      }}
    >
      <PopoverAnchor asChild>
        <span
          style={{
            position: 'fixed',
            left: detail.rect.left,
            top: detail.rect.top,
            width: detail.rect.width,
            height: detail.rect.height,
            display: 'block',
            pointerEvents: 'none',
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        container={portalTarget}
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-72 p-0"
        // Outside clicks are handled by the content-script listener (which
        // decides between close / open-another-block); only Escape dismisses
        // through Radix here.
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <div
          data-testid="ppl-block-detail"
          className="space-y-3 rounded-md p-4 font-sans text-sm text-foreground"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold">{t('floating.title')}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onDismiss}
              aria-label={t('floating.close')}
            >
              <XIcon />
            </Button>
          </div>

          {detail.error ? (
            <div className="text-xs text-destructive">
              {t('floating.fail', { error: detail.error })}
            </div>
          ) : (
            <div className="space-y-1.5">
              <DetailRow
                label={t('floating.avgPpl')}
                value={detail.avgPpl == null ? '-' : detail.avgPpl.toFixed(2)}
              />
              <DetailRow
                label={t('floating.avgNll')}
                value={detail.avgNll == null ? '-' : detail.avgNll.toFixed(3)}
              />
              <DetailRow label={t('floating.charCount')} value={String(detail.charCount)} />
              <DetailRow label={t('floating.tokenCount')} value={String(detail.tokenCount)} />
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <VerdictBadge verdict={detail.verdict} />
            <span data-testid="ppl-detail-profile" className="text-xs text-muted-foreground">
              {detail.profileId}
            </span>
          </div>

          {detail.onRemeasure && (
            <Button
              className="mt-3 w-full"
              variant="secondary"
              size="sm"
              onClick={detail.onRemeasure}
            >
              <RefreshCwIcon />
              {t('floating.remeasure')}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
