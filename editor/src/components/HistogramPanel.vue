<script setup lang="ts">
// ---------- Histogram panel: PPL distribution + layered-window controls ----------
// Keeps the imperative SVG renderer: window/draw state lives in shared reactive
// settings, and a `drawTick` signal triggers redraws. Ported from the old ui.ts.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '../i18n.ts'
import { settings, saveSettings } from '../composables/useSettings.ts'
import { useApp } from '../composables/useApp.ts'
import { clamp, colorForPpl } from '../util.ts'

const { t } = useI18n()
const { state, getTokens, settingsChanged } = useApp()

interface HistoScale {
  x: (ppl: number) => number
  invX: (px: number) => number
}

let histoData: { arr: number[]; x: HistoScale | null } = { arr: [], x: null }

const svgRef = ref<SVGSVGElement | null>(null)
const winWInputRef = ref<HTMLInputElement | null>(null)
const customWidthVisible = ref([5, 10, 20].includes(settings.windowWidth) ? false : true)

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
  const H = svg.clientHeight || 80
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  svg.innerHTML = ''

  const tokens = getTokens()
  const arr = tokens
    .filter((tk) => !tk.stale && !tk.ignored && tk.ppl != null)
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
  svg.appendChild(mk('rect', { x: padL, y: padT, width: Math.max(0, x1 - padL), height: H - padT - padB, fill: 'rgba(60,60,60,0.35)' }))
  svg.appendChild(mk('rect', { x: x2, y: padT, width: Math.max(0, W - padR - x2), height: H - padT - padB, fill: 'rgba(60,60,60,0.35)' }))

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
    brush.selEl.setAttribute('height', String(svg.clientHeight || 80))
  })
}

// Pointer-up resolves the dragged range into a percentile window.
function attachBrushUp(svg: SVGSVGElement): void {
  svg.addEventListener('pointerup', (e) => {
    if (!brush) return
    const px = e.clientX - brush.rect.left
    const [a, b] = [Math.min(brush.startX, px), Math.max(brush.startX, px)]
    if (brush.selEl) brush.selEl.remove()
    brush = null
    if (b - a < 4 || !histoData.x) return
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
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="histo-panel" id="histo-panel">
    <div class="histo-controls">
      <span class="histo-title">{{ t('histo.title') }}</span>
      <button id="btn-win-down" :title="t('histo.winDownHint')" @click="shiftDown">◀ {{ t('histo.winDown') }}</button>
      <button id="btn-win-up" :title="t('histo.winUpHint')" @click="shiftUp">{{ t('histo.winUp') }} ▶</button>
      <button id="btn-win-top" :title="t('histo.winTopHint')" @click="toTop">
        {{ t('histo.winTop', { w: '' }) }}<span id="win-w-label">{{ settings.windowWidth }}</span>%
      </button>
      <button id="btn-win-all" :title="t('histo.winAllHint')" @click="toAll">{{ t('histo.winAll') }}</button>
      <label class="lbl">{{ t('histo.width') }}
        <select id="sel-win-w" @change="onWinWidthSelect">
          <option value="5">5%</option>
          <option value="10">10%</option>
          <option value="20">20%</option>
          <option value="custom">{{ t('histo.widthCustom') }}</option>
        </select>
      </label>
      <input
        id="inp-win-w" ref="winWInputRef" type="number" min="1" max="100" step="1"
        :style="{ display: customWidthVisible ? '' : 'none' }"
        :title="t('histo.widthCustomHint')" @change="onWinWidthCustomChange"
      />
      <span id="window-label" class="window-label">{{ windowLabel }}</span>
    </div>
    <svg id="histogram" ref="svgRef" preserveAspectRatio="none"></svg>
    <div class="histo-hint">{{ t('histo.hint') }}</div>
  </div>
</template>