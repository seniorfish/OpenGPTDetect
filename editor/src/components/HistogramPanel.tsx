// ---------- Histogram panel: PPL distribution + layered-window controls ----------
// A bottom Card. The SVG is rendered imperatively (in a useEffect driven by the
// app's drawTick); all inputs it reads come from the settings store via
// getState, so the renderer stays framework-light. The panel's shift/top/all
// actions are registered into the command registry so the Ctrl+K palette and
// the header can drive them from one implementation.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowUpToLine, ChevronDown, ChevronLeft, ChevronRight, Maximize, MousePointer2
} from 'lucide-react'
import { useI18n } from '@/i18n.ts'
import { useSettingsStore } from '@/stores/settings.ts'
import { useAppStore } from '@/stores/app.ts'
import { mergeIgnoreRanges, isIgnored } from '@/chunks.ts'
import { clamp, colorForPpl } from '@/util.ts'
import { registerHistoActions } from '@/commands.ts'
import { Button } from '@opengptdetect/ui'
import { Badge } from '@opengptdetect/ui'
import { Separator } from '@opengptdetect/ui'
import { Tooltip, TooltipTrigger, TooltipContent } from '@opengptdetect/ui'

interface HistoScale {
  x: (ppl: number) => number
  invX: (px: number) => number
}

export function HistogramPanel() {
  const { t } = useI18n()
  const settings = useSettingsStore((s) => s.settings)
  const drawTick = useAppStore((s) => s.drawTick)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const winWInputRef = useRef<HTMLInputElement | null>(null)
  // Histogram data shared between the drawer and the brush handlers.
  const histoRef = useRef<{ arr: number[]; x: HistoScale | null; svgW: number }>({ arr: [], x: null, svgW: 0 })
  const [customWidthVisible, setCustomWidthVisible] = useState(() => ![5, 10, 20].includes(settings.windowWidth))
  const [collapsed, setCollapsed] = useState(false)

  const tokenMode = settings.chunkMode === 'token'
  const windowLabel = t('histo.window', { n: settings.windowN, m: settings.windowM })

  // ---------- Layered window (mutations go through the settings store) ----------
  const setWindow = useCallback((n: number, m: number): void => {
    let lo = clamp(Math.round(n), 0, 100)
    let hi = clamp(Math.round(m), 0, 100)
    if (hi < lo) [lo, hi] = [hi, lo]
    useSettingsStore.getState().patchSettings({ windowN: lo, windowM: hi })
  }, [])

  const winWidth = useCallback((): number => useSettingsStore.getState().settings.windowWidth, [])

  const shiftUp = useCallback((): void => {
    const cur = useSettingsStore.getState().settings
    const w = cur.windowWidth
    if (cur.windowN === 0 && cur.windowM === 100) setWindow(0, w)
    else setWindow(Math.min(100 - w, cur.windowN + w), Math.min(100, cur.windowM + w))
  }, [setWindow])

  const shiftDown = useCallback((): void => {
    const cur = useSettingsStore.getState().settings
    const w = cur.windowWidth
    if (cur.windowN === 0 && cur.windowM === 100) setWindow(100 - w, 100)
    else setWindow(Math.max(0, cur.windowN - w), Math.max(w, cur.windowM - w))
  }, [setWindow])

  const toTop = useCallback((): void => {
    setWindow(100 - winWidth(), 100)
  }, [setWindow, winWidth])

  const toAll = useCallback((): void => {
    setWindow(0, 100)
  }, [setWindow])

  const applyWidth = useCallback((w: number): void => {
    const cur = useSettingsStore.getState().settings
    let m = cur.windowN + w
    let n = cur.windowN
    if (m > 100) {
      m = 100
      n = Math.max(0, 100 - w)
    }
    useSettingsStore.getState().patchSettings({ windowWidth: w })
    setWindow(n, m)
  }, [setWindow])

  // ---------- Histogram rendering (imperative, driven by drawTick) ----------
  const draw = useCallback((): void => {
    const svg = svgRef.current
    if (!svg) return
    const use = useSettingsStore.getState().settings
    const W = svg.clientWidth || 800
    const H = svg.clientHeight || 96
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    svg.innerHTML = ''

    const app = useAppStore.getState()
    const tokens = app.getTokens()
    const merged = mergeIgnoreRanges(app.getIgnores())
    const arr = tokens
      .filter((tk) => !tk.stale && !isIgnored(tk.start, tk.end, merged) && tk.ppl != null)
      .map((tk) => Math.max(tk.ppl!, 1e-6))
      .sort((a, b) => a - b)
    const NS = 'http://www.w3.org/2000/svg'
    const mk = (tag: string, attrs: Record<string, string | number>): SVGElement => {
      const el = document.createElementNS(NS, tag)
      for (const k in attrs) el.setAttribute(k, String(attrs[k]))
      return el
    }

    histoRef.current = { arr, x: null, svgW: W }

    if (!arr.length) {
      const empty = mk('text', { x: W / 2, y: H / 2 + 4, 'text-anchor': 'middle', class: 'histo-empty' })
      empty.textContent = t('histo.empty')
      svg.appendChild(empty)
      return
    }

    const padL = 6, padR = 6, padT = 4, padB = 14
    const lo = arr[0]!
    let hi = arr[arr.length - 1]!
    if (hi <= lo) hi = lo * 10
    const logLo = Math.log10(lo)
    const logHi = Math.log10(hi)
    const x = (ppl: number): number =>
      padL + ((Math.log10(Math.max(ppl, 1e-6)) - logLo) / (logHi - logLo)) * (W - padL - padR)
    const invX = (px: number): number => Math.pow(10, logLo + ((px - padL) / (W - padL - padR)) * (logHi - logLo))
    histoRef.current = { arr, x: { x, invX }, svgW: W }

    const K = Math.min(40, Math.max(10, arr.length))
    const bins: number[] = new Array(K).fill(0)
    for (const v of arr) {
      const idx = clamp(Math.floor(((Math.log10(v) - logLo) / (logHi - logLo)) * K), 0, K - 1)
      bins[idx]!++
    }
    const maxBin = Math.max(...bins)
    const barW = (W - padL - padR) / K
    bins.forEach((c, i) => {
      if (!c) return
      const midPpl = Math.pow(10, logLo + ((i + 0.5) / K) * (logHi - logLo))
      const bh = ((H - padT - padB) * c) / maxBin
      svg.appendChild(mk('rect', {
        x: padL + i * barW + 0.5,
        y: H - padB - bh,
        width: Math.max(1, barW - 1),
        height: bh,
        fill: colorForPpl(midPpl, use.stops),
        'fill-opacity': 0.85
      }))
    })

    // Layered window: dim outside the window.
    const pAt = (p: number): number => arr[clamp(Math.floor((p / 100) * arr.length), 0, arr.length - 1)]!
    const x1 = x(pAt(use.windowN))
    const x2 = use.windowM >= 100 ? W - padR : x(pAt(use.windowM))
    svg.appendChild(mk('rect', { x: padL, y: padT, width: Math.max(0, x1 - padL), height: H - padT - padB, class: 'histo-dim' }))
    svg.appendChild(mk('rect', { x: x2, y: padT, width: Math.max(0, W - padR - x2), height: H - padT - padB, class: 'histo-dim' }))

    // Axis labels.
    const fmt = (v: number): string => (v >= 1000 ? v.toExponential(1) : Number(v.toFixed(1)).toString())
    const tLo = mk('text', { x: padL, y: H - 3, class: 'histo-axis' })
    tLo.textContent = `PPL ${fmt(lo)}`
    const tHi = mk('text', { x: W - padR, y: H - 3, 'text-anchor': 'end', class: 'histo-axis' })
    tHi.textContent = t('histo.tokens', { hi: fmt(arr[arr.length - 1]!), count: arr.length })
    svg.appendChild(tLo)
    svg.appendChild(tHi)
  }, [t])

  useEffect(() => {
    draw()
  }, [draw, drawTick])

  // ---------- Brush: drag to pick a layered window ----------
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    let brush: { startX: number; rect: DOMRect; selEl: SVGRectElement | null } | null = null

    const onDown = (e: PointerEvent): void => {
      const cur = useSettingsStore.getState().settings
      if (cur.chunkMode !== 'token' || !histoRef.current.x || !histoRef.current.arr.length) return
      svg.setPointerCapture(e.pointerId)
      const rect = svg.getBoundingClientRect()
      brush = { startX: e.clientX - rect.left, rect, selEl: null }
    }
    const onMove = (e: PointerEvent): void => {
      if (!brush) return
      const px = e.clientX - brush.rect.left
      const x1 = clamp(Math.min(brush.startX, px), 0, brush.rect.width)
      const w = Math.abs(px - brush.startX)
      if (!brush.selEl) {
        brush.selEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect') as SVGRectElement
        brush.selEl.setAttribute('class', 'histo-brush')
        svg.appendChild(brush.selEl)
      }
      brush.selEl.setAttribute('x', String(x1))
      brush.selEl.setAttribute('y', '0')
      brush.selEl.setAttribute('width', String(w))
      brush.selEl.setAttribute('height', String(svg.clientHeight || 96))
    }
    const onUp = (e: PointerEvent): void => {
      endBrush(e, true)
    }
    const onCancel = (e: PointerEvent): void => {
      endBrush(e, false)
    }
    const endBrush = (e: PointerEvent, resolve: boolean): void => {
      const svgCur = svg
      if (svgCur.hasPointerCapture(e.pointerId)) svgCur.releasePointerCapture(e.pointerId)
      const current = brush
      brush = null
      if (!current) return
      if (current.selEl) current.selEl.remove()
      if (!resolve || !histoRef.current.x) return
      const px = e.clientX - current.rect.left
      const [a, b] = [Math.min(current.startX, px), Math.max(current.startX, px)]
      if (b - a < 4) return
      const arr = histoRef.current.arr
      const xScale = histoRef.current.x
      const lo = xScale.invX(a)
      const hi = xScale.invX(b)
      let below = 0, belowEq = 0
      for (const v of arr) {
        if (v < lo) below++
        if (v <= hi) belowEq++
      }
      const n = (below / arr.length) * 100
      const m = Math.max((belowEq / arr.length) * 100, n + 1)
      setWindow(n, m)
    }

    svg.addEventListener('pointerdown', onDown)
    svg.addEventListener('pointermove', onMove)
    svg.addEventListener('pointerup', onUp)
    svg.addEventListener('pointercancel', onCancel)
    return () => {
      svg.removeEventListener('pointerdown', onDown)
      svg.removeEventListener('pointermove', onMove)
      svg.removeEventListener('pointerup', onUp)
      svg.removeEventListener('pointercancel', onCancel)
    }
  }, [setWindow])

  // ---------- Resize redraw ----------
  useEffect(() => {
    const onResize = (): void => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [draw])

  // ---------- Register window actions into the command registry ----------
  useEffect(() => {
    registerHistoActions({ shiftDown, shiftUp, toTop, toAll })
  }, [shiftDown, shiftUp, toTop, toAll])

  function onWinWidthSelect(event: React.ChangeEvent<HTMLSelectElement>): void {
    const value = event.target.value
    if (value === 'custom') {
      setCustomWidthVisible(true)
      winWInputRef.current?.focus()
    } else {
      setCustomWidthVisible(false)
      applyWidth(Number(value))
    }
  }

  function onWinWidthCustomChange(event: React.ChangeEvent<HTMLInputElement>): void {
    applyWidth(clamp(Number(event.target.value) || 10, 1, 100))
  }

  return (
    <section className="shrink-0 border-t bg-card">
      <div className="px-4 pt-2 pb-2.5">
        {/* Header row: title + window status + control cluster */}
        <div className="flex items-center gap-2">
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setCollapsed((v) => !v)}
              >
                <ChevronDown
                  className={`size-3.5 transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}
                />
                {t('histo.title')}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('histo.collapseHint')}</TooltipContent>
          </Tooltip>

          {!collapsed && tokenMode && (
            <Badge
              id="window-label"
              variant="secondary"
              className="h-4.5 px-1.5 font-mono text-[10px] font-medium tabular-nums"
            >
              {windowLabel}
            </Badge>
          )}
          {!collapsed && !tokenMode && (
            <span className="text-[11px] text-muted-foreground">{t('histo.tokenOnly')}</span>
          )}

          <div className="flex-1" />

          {!collapsed && (
            <>
              {/* Window control cluster */}
              <div className="flex items-center gap-1">
                <span className="hidden text-[11px] text-muted-foreground md:inline">{t('histo.width')}</span>
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <select
                      id="sel-win-w"
                      disabled={!tokenMode}
                      className="h-7 rounded-md border bg-transparent px-1.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                      onChange={onWinWidthSelect}
                    >
                      <option value="5">5%</option>
                      <option value="10">10%</option>
                      <option value="20">20%</option>
                      <option value="custom">{t('histo.widthCustom')}</option>
                    </select>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t('histo.widthHint')}</TooltipContent>
                </Tooltip>
                <input
                  id="inp-win-w"
                  ref={winWInputRef}
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  disabled={!tokenMode}
                  style={{ display: customWidthVisible ? '' : 'none' }}
                  title={t('histo.widthCustomHint')}
                  className="h-7 w-14 rounded-md border bg-transparent px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={onWinWidthCustomChange}
                />
              </div>

              <Separator orientation="vertical" className="mx-1 h-5" />

              <div className="flex items-center gap-0.5">
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <Button id="btn-win-down" variant="ghost" size="icon-sm" disabled={!tokenMode} onClick={shiftDown}>
                      <ChevronLeft className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t('histo.winDownHint')}</TooltipContent>
                </Tooltip>
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <Button id="btn-win-up" variant="ghost" size="icon-sm" disabled={!tokenMode} onClick={shiftUp}>
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t('histo.winUpHint')}</TooltipContent>
                </Tooltip>
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <Button id="btn-win-top" variant="ghost" size="icon-sm" disabled={!tokenMode} onClick={toTop}>
                      <ArrowUpToLine className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t('histo.winTopHint')}</TooltipContent>
                </Tooltip>
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <Button id="btn-win-all" variant="ghost" size="icon-sm" disabled={!tokenMode} onClick={toAll}>
                      <Maximize className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t('histo.winAllHint')}</TooltipContent>
                </Tooltip>
              </div>
            </>
          )}
        </div>

        {/* Histogram */}
        {!collapsed && (
          <>
            <svg id="histogram" ref={svgRef} className="histo-area mt-2" preserveAspectRatio="none" />
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <MousePointer2 className="size-3" />
              {t('histo.hint')}
            </p>
          </>
        )}
      </div>
    </section>
  )
}