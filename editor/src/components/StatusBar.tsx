// ---------- Status bar ----------
// A slim bottom strip: backend health badge, document statistics (avg PPL colored
// by the active palette), and cursor position. All document-derived numbers come
// from useDocMetrics (see the "derived state never enters the store" rule); the
// remaining facts are read directly from the app/settings stores.
import { useI18n } from '@/i18n.ts'
import { useAppStore } from '@/stores/app.ts'
import { useSettingsStore } from '@/stores/settings.ts'
import { colorForPpl, fmtNum } from '@/util.ts'
import { useDocMetrics } from '@/hooks/useDocMetrics.ts'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

export function StatusBar() {
  const { t } = useI18n()
  const health = useAppStore((s) => s.health)
  const tokenCount = useAppStore((s) => s.tokenCount)
  const elapsedMs = useAppStore((s) => s.elapsedMs)
  const analyze = useAppStore((s) => s.analyze)
  const serverUrl = useSettingsStore((s) => s.settings.serverUrl)
  const stops = useSettingsStore((s) => s.settings.stops)
  const m = useDocMetrics()

  const online = health != null
  const backendLabel = online
    ? t('statusbar.backendOnline', { model: health!.model || '' })
    : t('statusbar.backendOffline')
  const backendHint = online
    ? t('statusbar.backendOnlineHint', {
        model: health!.model || '?',
        n_ctx: health!.n_ctx ?? '?',
        max: health!.max_char_count,
        backend: health!.nll_backend || '?'
      })
    : t('statusbar.backendOfflineHint', { url: serverUrl })

  const chars = t('statusbar.chars', { n: m.charCount })
  const tokens =
    tokenCount != null ? t('statusbar.tokens', { count: tokenCount }) : t('statusbar.tokensNone')
  const elapsed =
    elapsedMs != null ? t('statusbar.elapsed', { ms: Math.round(elapsedMs) }) : t('statusbar.elapsedNone')
  const nll = m.avgNll != null ? t('statusbar.nll', { n: m.avgNll.toFixed(3) }) : t('statusbar.nllNone')
  const ppl = m.avgPpl != null ? t('statusbar.ppl', { n: fmtNum(m.avgPpl) }) : t('statusbar.pplNone')
  const pplColor = m.avgPpl != null ? colorForPpl(m.avgPpl, stops) : 'var(--muted-foreground)'
  const coverage = m.coverage != null ? t('statusbar.coverage', { p: m.coverage.toFixed(0) }) : t('statusbar.coverageNone')
  const position = t('statusbar.pos', { line: m.cursorLine, col: m.cursorCol })

  const dot = online ? 'bg-success' : 'bg-destructive'

  return (
    <footer className="flex h-8 shrink-0 items-center gap-1 border-t bg-background px-3 text-xs text-muted-foreground">
      {/* Backend health */}
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span id="st-backend" className="flex cursor-default items-center gap-1.5">
            <span className="relative flex size-2">
              {online && (
                <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${dot}`} />
              )}
              <span className={`relative inline-flex size-2 rounded-full ${dot}`} />
            </span>
            <span className={`max-w-56 truncate ${online ? 'text-foreground' : 'text-destructive'}`}>
              {backendLabel}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{backendHint}</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-1.5 h-4" />

      {/* Statistics */}
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span id="st-chars" className="hover:bg-accent cursor-default rounded px-1.5 py-0.5">{chars}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{t('statusbar.charsHint')}</TooltipContent>
      </Tooltip>

      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span
            id="st-tokens"
            className="cursor-pointer rounded px-1.5 py-0.5 text-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => void analyze(true)}
          >
            {tokens}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{t('statusbar.tokensHint')}</TooltipContent>
      </Tooltip>

      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span id="st-elapsed" className="hover:bg-accent cursor-default rounded px-1.5 py-0.5">{elapsed}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{t('statusbar.elapsedHint')}</TooltipContent>
      </Tooltip>

      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span id="st-nll" className="hover:bg-accent cursor-default rounded px-1.5 py-0.5">{nll}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{t('statusbar.nllHint')}</TooltipContent>
      </Tooltip>

      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span
            id="st-ppl"
            className="hover:bg-accent cursor-default rounded px-1.5 py-0.5 font-semibold"
            style={{ color: pplColor }}
          >
            {ppl}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{t('statusbar.pplHint')}</TooltipContent>
      </Tooltip>

      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span id="st-cov" className="hover:bg-accent cursor-default rounded px-1.5 py-0.5">{coverage}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{t('statusbar.coverageHint')}</TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      {/* Cursor position */}
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span id="st-pos" className="font-mono text-[11px]">{position}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{t('statusbar.posHint')}</TooltipContent>
      </Tooltip>
    </footer>
  )
}