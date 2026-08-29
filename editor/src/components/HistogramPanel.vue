<script setup lang="ts">
// ---------- Histogram panel: PPL distribution + layered-window controls ----------
// A bottom Card. Keeps the imperative SVG renderer (window/draw state lives in
// shared reactive settings; a `drawTick` signal triggers redraws). The panel's
// shift/top/all actions are also registered into the command registry so the
// Ctrl+K palette and the header can drive them from one implementation.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowDownToLine, ArrowUpToLine, ChevronDown, ChevronLeft, ChevronRight,
  Maximize, MousePointer2
} from '@lucide/vue'
import { useI18n } from '../i18n.ts'
import { settings, saveSettings } from '../composables/useSettings.ts'
import { useApp } from '../composables/useApp.ts'
import { mergeIgnoreRanges, isIgnored } from '../chunks.ts'
import { clamp, colorForPpl } from '../util.ts'
import { registerHistoActions } from '../commands.ts'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent } from '../components/ui/tooltip'

const { t } = useI18n()
const { state, getTokens, getIgnores, settingsChanged } = useApp()

interface HistoScale {
  x: (ppl: number) => number
  invX: (px: number) => number
}

let histoData: { arr: number[]; x: HistoScale | null } = { arr: [], x: null }

const svgRef = ref<SVGSVGElement | null>(null)
const winWInputRef = ref<HTMLInputElement | null>(null)
const customWidthVisible = ref([5, 10, 20].includes(settings.windowWidth) ? false : true)
const collapsed = ref(false)

const tokenMode = computed(() => settings.chunkMode === 'token')
const windowLabel = computed(() => t('histo.window', { n: settings.windowN, m: settings.windowM }))

// ---------- Layered window ----------
function setWindow(n: number, m: number): void {
  settings.windowN = clamp(Math.round(n), 0, 100)
  settings.windowM = clamp(Math.round(m), 0, 100)
  if (settings.windowM < settings.windowN) [settings.windowN, settings.windowM] = [settings.windowM, settings.windowN]
  saveSettings()
  settingsChanged()
}

function winWidth(): number {
  return settings.windowWidth
}

function shiftUp(): void {
  const w = winWidth()
  if (settings.windowN === 0 && settings.windowM === 100) setWindow(0, w)
  else setWindow(Math.min(100 - w, settings.windowN + w), Math.min(100, settings.windowM + w))
}

function shiftDown(): void {
  const w = winWidth()
  if (settings.windowN === 0 && settings.windowM === 100) setWindow(100 - w, 100)
  else setWindow(Math.max(0, settings.windowN - w), Math.max(w, settings.windowM - w))
}

function toTop(): void {
  setWindow(100 - winWidth(), 100)
}

function toAll(): void {
  setWindow(0, 100)
}

function applyWidth(w: number): void {
  settings.windowWidth = w
  let m = settings.windowN + w
  let n = settings.windowN
  if (m > 100) {
    m = 100
    n = Math.max(0, 100 - w)
  }
  setWindow(n, m)
}

function onWinWidthSelect(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'custom') {
    customWidthVisible.value = true
    winWInputRef.value?.focus()
  } else {
    customWidthVisible.value = false
    applyWidth(Number(value))
  }
}

function onWinWidthCustomChange(event: Event): void {
  applyWidth(clamp(Number((event.target as HTMLInputElement).value) || 10, 1, 100))
}

// ---------- Histogram rendering ----------
function draw(): void {
  const svg = svgRef.value
  if (!svg) return
  const W = svg.clientWidth || 800
  const H = svg.clientHeight || 96
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  svg.innerHTML = ''

  const tokens = getTokens()
  const merged = mergeIgnoreRanges(getIgnores())
  const arr = tokens
    .filter((tk) => !tk.stale && !isIgnored(tk.start, tk.end, merged) && tk.ppl != null)
    .map((tk) => Math.max(tk.ppl!, 1e-6))
    .sort((a, b) => a - b)
  histoData.arr = arr
  const NS = 'http://www.w3.org/2000/svg'
  const mk = (tag: string, attrs: Record<string, string | number>): SVGElement => {
    const el = document.createElementNS(NS, tag)
    for (const k in attrs) el.setAttribute(k, String(attrs[k]))
    return el
  }

  if (!arr.length) {
    const empty = mk('text', { x: W / 2, y: H / 2 + 4, 'text-anchor': 'middle', class: 'histo-empty' })
    empty.textContent = t('histo.empty')
    svg.appendChild(empty)
    histoData.x = null
    return
  }

  const padL = 6, padR = 6, padT = 4, padB = 14
  const lo = arr[0]
  let hi = arr[arr.length - 1]
  if (hi <= lo) hi = lo * 10
  const logLo = Math.log10(lo)
  const logHi = Math.log10(hi)
  const x = (ppl: number): number =>
    padL + ((Math.log10(Math.max(ppl, 1e-6)) - logLo) / (logHi - logLo)) * (W - padL - padR)
  const invX = (px: number): number => Math.pow(10, logLo + ((px - padL) / (W - padL - padR)) * (logHi - logLo))
  histoData.x = { x, invX }

  const K = Math.min(40, Math.max(10, arr.length))
  const bins: number[] = new Array(K).fill(0)
  for (const v of arr) {
    const idx = clamp(Math.floor(((Math.log10(v) - logLo) / (logHi - logLo)) * K), 0, K - 1)
    bins[idx]++
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
      fill: colorForPpl(midPpl, settings.stops),
      'fill-opacity': 0.85
    }))
  })

  // Layered window: dim outside the window.
  const pAt = (p: number): number => arr[clamp(Math.floor((p / 100) * arr.length), 0, arr.length - 1)]
  const x1 = x(pAt(settings.windowN))
  const x2 = settings.windowM >= 100 ? W - padR : x(pAt(settings.windowM))
  svg.appendChild(mk('rect', { x: padL, y: padT, width: Math.max(0, x1 - padL), height: H - padT - padB, class: 'histo-dim' }))
  svg.appendChild(mk('rect', { x: x2, y: padT, width: Math.max(0, W - padR - x2), height: H - padT - padB, class: 'histo-dim' }))

  // Axis labels.
  const fmt = (v: number): string => (v >= 1000 ? v.toExponential(1) : Number(v.toFixed(1)).toString())
  const tLo = mk('text', { x: padL, y: H - 3, class: 'histo-axis' })
  tLo.textContent = `PPL ${fmt(lo)}`
  const tHi = mk('text', { x: W - padR, y: H - 3, 'text-anchor': 'end', class: 'histo-axis' })
  tHi.textContent = t('histo.tokens', { hi: fmt(arr[arr.length - 1]), count: arr.length })
  svg.appendChild(tLo)
  svg.appendChild(tHi)
}

function scheduleDraw(): void {
  requestAnimationFrame(draw)
}

// ---------- Brush: drag to pick a layered window ----------
interface Brush {
  startX: number
  rect: DOMRect
  selEl: SVGRectElement | null
}

let brush: Brush | null = null

function endBrush(svg: SVGSVGElement, e: PointerEvent, resolve: boolean): void {
  if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId)
  const current = brush
  brush = null
  if (!current) return
  if (current.selEl) current.selEl.remove()
  if (!resolve || !histoData.x) return
  const px = e.clientX - current.rect.left
  const [a, b] = [Math.min(current.startX, px), Math.max(current.startX, px)]
  if (b - a < 4) return
  const arr = histoData.arr
  const lo = histoData.x.invX(a)
  const hi = histoData.x.invX(b)
  let below = 0, belowEq = 0
  for (const v of arr) {
    if (v < lo) below++
    if (v <= hi) belowEq++
  }
  const n = (below / arr.length) * 100
  const m = Math.max((belowEq / arr.length) * 100, n + 1)
  setWindow(n, m)
}

function attachBrush(svg: SVGSVGElement): void {
  svg.addEventListener('pointerdown', (e) => {
    if (settings.chunkMode !== 'token' || !histoData.x || !histoData.arr.length) return
    svg.setPointerCapture(e.pointerId)
    const rect = svg.getBoundingClientRect()
    brush = { startX: e.clientX - rect.left, rect, selEl: null }
  })
  svg.addEventListener('pointermove', (e) => {
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
  })
}

function attachBrushUp(svg: SVGSVGElement): void {
  svg.addEventListener('pointerup', (e) => {
    endBrush(svg, e, true)
  })
  svg.addEventListener('pointercancel', (e) => {
    endBrush(svg, e, false)
  })
}

function onResize(): void {
  scheduleDraw()
}

onMounted(() => {
  if (svgRef.value) {
    attachBrush(svgRef.value)
    attachBrushUp(svgRef.value)
  }
  window.addEventListener('resize', onResize)
  watch(() => state.drawTick, scheduleDraw, { flush: 'post' })
  scheduleDraw()
  // Expose the window actions to the command registry.
  registerHistoActions({ shiftDown, shiftUp, toTop, toAll })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <section class="shrink-0 border-t bg-card">
    <div class="px-4 pt-2 pb-2.5">
      <!-- Header row: title + window status + control cluster -->
      <div class="flex items-center gap-2">
        <Tooltip :delay-duration="150">
          <TooltipTrigger as-child>
            <button
              class="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
              @click="collapsed = !collapsed"
            >
              <ChevronDown class="size-3.5 transition-transform duration-150" :class="{ '-rotate-90': collapsed }" />
              {{ t('histo.title') }}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{{ t('histo.collapseHint') }}</TooltipContent>
        </Tooltip>

        <Badge
          v-if="!collapsed && tokenMode"
          id="window-label"
          variant="secondary"
          class="h-4.5 px-1.5 font-mono text-[10px] font-medium tabular-nums"
        >
          {{ windowLabel }}
        </Badge>
        <span v-else-if="!collapsed" class="text-[11px] text-muted-foreground">{{ t('histo.tokenOnly') }}</span>

        <div class="flex-1" />

        <template v-if="!collapsed">
          <!-- Window control cluster -->
          <div class="flex items-center gap-1">
            <span class="hidden text-[11px] text-muted-foreground md:inline">{{ t('histo.width') }}</span>
            <Tooltip :delay-duration="150">
              <TooltipTrigger as-child>
                <select
                  id="sel-win-w"
                  :disabled="!tokenMode"
                  class="h-7 rounded-md border bg-transparent px-1.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                  @change="onWinWidthSelect"
                >
                  <option value="5">5%</option>
                  <option value="10">10%</option>
                  <option value="20">20%</option>
                  <option value="custom">{{ t('histo.widthCustom') }}</option>
                </select>
              </TooltipTrigger>
              <TooltipContent side="top">{{ t('histo.widthHint') }}</TooltipContent>
            </Tooltip>
            <input
              id="inp-win-w"
              ref="winWInputRef"
              type="number"
              min="1"
              max="100"
              step="1"
              :disabled="!tokenMode"
              :style="{ display: customWidthVisible ? '' : 'none' }"
              :title="t('histo.widthCustomHint')"
              class="h-7 w-14 rounded-md border bg-transparent px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              @change="onWinWidthCustomChange"
            />
          </div>

          <Separator orientation="vertical" class="mx-1 h-5" />

          <div class="flex items-center gap-0.5">
            <Tooltip :delay-duration="150">
              <TooltipTrigger as-child>
                <Button id="btn-win-down" variant="ghost" size="icon-sm" :disabled="!tokenMode" @click="shiftDown">
                  <ChevronLeft class="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{{ t('histo.winDownHint') }}</TooltipContent>
            </Tooltip>
            <Tooltip :delay-duration="150">
              <TooltipTrigger as-child>
                <Button id="btn-win-up" variant="ghost" size="icon-sm" :disabled="!tokenMode" @click="shiftUp">
                  <ChevronRight class="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{{ t('histo.winUpHint') }}</TooltipContent>
            </Tooltip>
            <Tooltip :delay-duration="150">
              <TooltipTrigger as-child>
                <Button id="btn-win-top" variant="ghost" size="icon-sm" :title="t('histo.winTopHint')" :disabled="!tokenMode" @click="toTop">
                  <ArrowUpToLine class="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{{ t('histo.winTopHint') }}</TooltipContent>
            </Tooltip>
            <Tooltip :delay-duration="150">
              <TooltipTrigger as-child>
                <Button id="btn-win-all" variant="ghost" size="icon-sm" :disabled="!tokenMode" @click="toAll">
                  <Maximize class="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{{ t('histo.winAllHint') }}</TooltipContent>
            </Tooltip>
          </div>
        </template>
      </div>

      <!-- Histogram -->
      <template v-if="!collapsed">
        <svg id="histogram" ref="svgRef" class="histo-area mt-2" preserveAspectRatio="none"></svg>
        <p class="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <MousePointer2 class="size-3" />
          {{ t('histo.hint') }}
        </p>
      </template>
    </div>
  </section>
</template>