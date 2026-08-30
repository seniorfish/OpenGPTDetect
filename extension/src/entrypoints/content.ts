// ---------- Page orchestration: scan -> viewport queue -> measure -> paint ----------
// Behaviour parity with the legacy script:
//   - IntersectionObserver lazy measurement + MutationObserver re-scan
//   - unit measurement (merge short blocks, split on sentence boundaries)
//   - OOM half-retry on a 500
// New: explicit measure state machine (core/state.ts), profile-bound color
// scales, fully inline annotation styles (zero CSS injection), typed messages
// to the background (page CORS bypass + schema-validated responses) and a
// ShadowRoot floating UI for block details (S6).
import '../assets/content-ui.css'
import {
  BUILTIN_PROFILES,
  computeStats,
  detectLang,
  offsetTokens,
  splitChunks,
  transition,
  INITIAL_MEASURE_STATE,
  isTerminal,
  type MeasureState,
  type TokenDetail,
  type ColorStop,
} from '@opengptdetect/core'
import { getSettings, settingsItem, type ExtensionSettings } from '../lib/settings.ts'
import { send } from '../lib/messaging.ts'
import {
  scan,
  groupUnits,
  setState,
  getState,
  getFlatText,
  type MeasurementUnit,
} from '../lib/dom-scan.ts'
import { createObserver, pickInitial, startMutationWatch } from '../lib/viewport.ts'
import * as annotate from '../lib/annotate.ts'
import { renderBlock } from '../lib/heatmap.ts'
import { mountFloatingUi, type FloatingUi } from '../lib/floating.tsx'
import type { AiVerdict, BlockDetailInput } from '../components/block-detail.tsx'

/** Stops for a detected class; falls back to the built-in zh/en defaults. */
function stopsFor(lang: 'zh' | 'en', profiles: ExtensionSettings['profiles']): ColorStop[] {
  const profile = BUILTIN_PROFILES.find((p) => p.id === profiles[lang])
  return (profile ?? BUILTIN_PROFILES[lang === 'zh' ? 0 : 1]!).scale.stops
}

interface Measured {
  tokens: TokenDetail[]
  avgPpl: number | null
  avgNll: number | null
  charCount: number
  lang: 'zh' | 'en'
  error: string | null
}

interface UnitRecord {
  state: MeasureState
  unit: MeasurementUnit
  measured: Measured | null
}

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  main(ctx) {
    let settings: ExtensionSettings | null = null
    let enabled = false
    let started = false
    let io: IntersectionObserver | null = null
    let mo: MutationObserver | null = null
    let unwatch: (() => void) | null = null
    let floating: FloatingUi | null = null

    const queue: { state: MeasureState; unit: MeasurementUnit }[] = []
    let inFlight = 0
    /** First-block element -> unit + state machine record. */
    const records = new Map<Element, UnitRecord>()

    function isAllowed(): boolean {
      const s = settings!
      const mode = s.listMode
      if (mode === 'off') return true
      const host = location.hostname
      const match = (list: string[]): boolean =>
        list.some((p) => {
          const pat = p.trim().toLowerCase()
          if (!pat) return false
          if (pat.startsWith('*.')) {
            const tail = pat.slice(1)
            return host === pat.slice(2) || host.endsWith(tail)
          }
          return host === pat || host.endsWith('.' + pat)
        })
      if (mode === 'whitelist') return match(s.whitelist)
      if (mode === 'blacklist') return !match(s.blacklist)
      return true
    }

    function hideAll(show: boolean): void {
      const spanClasses = ['ppl-tok', 'ppl-label', 'ppl-ai-tag', 'ppl-loading', 'ppl-error-tag']
      for (const c of spanClasses) {
        for (const el of document.querySelectorAll<HTMLElement>('.' + c)) {
          el.style.display = show ? '' : 'none'
        }
      }
      // Re-apply / restore the AI left borders as a whole.
      for (const el of document.querySelectorAll<HTMLElement>('.' + annotate.AI_CLASS)) {
        if (!annotate.hasAI(el)) continue
        if (show) annotate.setAI(el, settings!)
        else annotate.clearAI(el)
      }
    }

    function applyEnabled(on: boolean): void {
      enabled = on
      hideAll(on)
      if (on && settings && isAllowed()) {
        if (!started) start()
        else pump()
      }
    }

    function unitWords(u: MeasurementUnit): number {
      const words = u.blocks.reduce(
        (s, b) => (b.text.match(/\S+/g) ? b.text.match(/\S+/g)!.length : 0),
        0,
      )
      return words
    }

    function enqueueUnit(u: MeasurementUnit): void {
      const first = u.blocks[0]!.el
      const state = getState(first)
      if (state === 'done' || state === 'measuring') return
      const rec = records.get(first)
      if (rec && isTerminal(rec.state)) return
      if (!rec) records.set(first, { state: INITIAL_MEASURE_STATE, unit: u, measured: null })
      queue.push({ state: rec?.state ?? INITIAL_MEASURE_STATE, unit: u })
      pump()
    }

    function pump(): void {
      if (!enabled) return
      const concurrency = Math.max(1, settings?.measureConcurrency ?? 1)
      while (inFlight < concurrency && queue.length) {
        const rec = queue.shift()!
        inFlight++
        measureAndRender(rec).finally(() => {
          inFlight--
          pump()
        })
      }
    }

    // ----- measure one unit (chunk -> api -> merge -> paint) -----
    async function fetchChunk(base: number, text: string, partial?: boolean): Promise<Measured> {
      const resp = await send('ppl', { baseUrl: settings!.apiBaseUrl, text })
      if (!resp.ok) {
        if (resp.status === 500 && text.length > 200 && !partial) {
          // OOM: halve the chunk and merge the halves.
          const half = Math.ceil(text.length / 2)
          const left = await fetchChunk(base, text.slice(0, half), true)
          const right = await fetchChunk(base, text.slice(half), true)
          return mergeMeasured(left, right, text.length)
        }
        return {
          tokens: [],
          avgPpl: null,
          avgNll: null,
          charCount: text.length,
          lang: 'zh',
          error: resp.error ?? 'failed',
        }
      }
      const tokens = offsetTokens(resp.data.token_details, base)
      const stats = computeStats(tokens)
      return {
        tokens,
        avgPpl: stats.avgPpl,
        avgNll: stats.avgNll,
        charCount: text.length,
        lang: 'zh',
        error: null,
      }
    }

    function mergeMeasured(a: Measured, b: Measured, charCount: number): Measured {
      const tokens = [...a.tokens, ...b.tokens]
      const stats = computeStats(tokens)
      return {
        tokens,
        avgPpl: stats.avgPpl,
        avgNll: stats.avgNll,
        charCount,
        lang: a.lang,
        error: a.error ?? b.error ?? null,
      }
    }

    async function measureUnit(unit: MeasurementUnit): Promise<Measured> {
      const text = unit.text
      const lang = detectLang(text, settings!.englishCharRatioThreshold)
      const chunks = splitChunks(text, settings!.maxCharsPerRequest, lang)
      let acc: Measured | null = null
      for (const chunk of chunks) {
        const part = await fetchChunk(chunk.start, chunk.text)
        acc = acc ? mergeMeasured(acc, part, text.length) : { ...part, lang }
      }
      return (
        acc ?? {
          tokens: [],
          avgPpl: null,
          avgNll: null,
          charCount: text.length,
          lang,
          error: 'empty',
        }
      )
    }

    async function measureAndRender(rec: {
      state: MeasureState
      unit: MeasurementUnit
    }): Promise<void> {
      const unit = rec.unit
      rec.state = transition(rec.state, { type: 'start' })
      for (const b of unit.blocks) {
        setState(b.el, 'measuring')
        annotate.clearAll(b.el)
        annotate.addLoading(b.el, settings!)
      }
      const m = await measureUnit(unit)

      const ai = isAI(m)
      for (let i = 0; i < unit.blocks.length; i++) {
        const b = unit.blocks[i]!
        const offset = unit.offsets[i]!.start
        const len = b.text.length
        try {
          const flat = getFlatText(b.el)
          const tokens = m.tokens.map((t) => ({
            ppl: t.ppl,
            text: t.token_text,
            char_start: t.char_start ?? 0,
            char_end: t.char_end ?? 0,
          }))
          renderBlock(
            b.el,
            flat,
            tokens,
            offset,
            len,
            settings!,
            stopsFor(m.lang, settings!.profiles),
          )
        } catch {
          // a DOM hiccup must not kill the queue
        }
        annotate.removeLoading(b.el)
        if (m.error || m.avgPpl == null) {
          if (i === 0) annotate.addError(b.el)
          setState(b.el, 'error')
          rec.state = transition(rec.state, { type: 'fail', code: 'unknown' })
        } else {
          if (b.text.length >= settings!.annotateThresholdChars) {
            annotate.addLabel(b.el, m.avgPpl, m.lang, settings!)
          }
          if (ai) annotate.markAI(b.el, settings!)
          setState(b.el, 'done')
          rec.state = transition(rec.state, { type: 'result', avgPpl: m.avgPpl })
        }
      }
      // Persist the outcome for the floating detail UI (same record the map holds).
      const firstRec = records.get(unit.blocks[0]!.el)
      if (firstRec) firstRec.measured = m
    }

    function isAI(m: Measured): boolean {
      const s = settings!
      if (!s.aiDetectEnabled) return false
      if (m.tokens.length < s.aiMinReliableTokens) return false
      if (m.charCount < s.reliableMinChars) return false
      if (m.avgPpl == null) return false
      // Guideline threshold comes from the bound profile (S7 exposes editing).
      const profile = BUILTIN_PROFILES.find((p) => p.id === s.profiles[m.lang])
      const thr = profile?.guideline.aiLikePplMax ?? (m.lang === 'en' ? 6 : 18)
      return m.avgPpl < thr
    }

    // ----- floating block detail UI (S6) -----
    function guidelineFor(
      lang: 'zh' | 'en',
    ): { aiLikePplMax: number; humanLikePplMin: number } | undefined {
      const profile = BUILTIN_PROFILES.find((p) => p.id === settings!.profiles[lang])
      return profile?.guideline
    }

    function verdictFor(m: Measured): AiVerdict {
      if (m.error || m.avgPpl == null || !settings!.aiDetectEnabled) return 'unknown'
      const g = guidelineFor(m.lang)
      if (!g) return 'unknown'
      if (m.avgPpl < g.aiLikePplMax) return 'ai'
      if (m.avgPpl >= g.humanLikePplMin) return 'human'
      return 'uncertain'
    }

    function blockDetailFrom(rec: UnitRecord): BlockDetailInput | null {
      const m = rec.measured
      if (!m) return null
      const profile = BUILTIN_PROFILES.find((p) => p.id === settings!.profiles[m.lang])
      return {
        avgPpl: m.avgPpl,
        avgNll: m.avgNll,
        charCount: m.charCount,
        tokenCount: m.tokens.length,
        lang: m.lang,
        profileId: profile?.id ?? (m.lang === 'en' ? 'en-default-2026' : 'zh-default-2026'),
        verdict: verdictFor(m),
        error: m.error,
        onRemeasure: () => remeasureBlock(rec),
      }
    }

    function remeasureBlock(rec: UnitRecord): void {
      floating?.close()
      rec.measured = null
      for (const b of rec.unit.blocks) setState(b.el, 'pending')
      enqueueUnit(rec.unit)
    }

    /** One document-wide click handler: open/close the floating detail popover. */
    function onDocumentClick(e: MouseEvent): void {
      if (!floating || !enabled || !isAllowed()) return
      const label = (e.target as Element | null)?.closest?.('.' + annotate.LABEL_CLASS)
      if (!label) {
        floating.close()
        return
      }
      const block = label.parentElement
      if (!block) return
      const rec = records.get(block)
      const detail = rec ? blockDetailFrom(rec) : null
      if (detail) floating.open(block, detail)
    }

    // ----- lifecycle -----
    function start(): void {
      if (started) return
      started = true
      io = createObserver(settings!.viewportRootMargin, (el) => {
        const rec = records.get(el)
        if (rec) enqueueUnit(rec.unit)
      })
      const candidates = scan(document.body, settings!)
      const units = groupUnits(candidates, settings!)
      const initial = pickInitial(
        units.map((u) => ({ words: unitWords(u), unit: u })),
        settings!.initialMeasureWords,
      )
      const initialSet = new Set(initial.map((x) => x.unit))
      for (const u of units) {
        const first = u.blocks[0]!.el
        if (records.has(first)) continue
        records.set(first, { state: INITIAL_MEASURE_STATE, unit: u, measured: null })
        setState(first, 'pending')
        io.observe(first)
        if (initialSet.has(u)) enqueueUnit(u)
      }
      mo = startMutationWatch(() => {
        const cands = scan(document.body, settings!)
        if (!cands.length) return
        for (const u of groupUnits(cands, settings!)) {
          const first = u.blocks[0]!.el
          if (records.has(first)) continue
          records.set(first, { state: INITIAL_MEASURE_STATE, unit: u, measured: null })
          setState(first, 'pending')
          io?.observe(first)
          enqueueUnit(u)
        }
      })
    }

    function stop(): void {
      started = false
      io?.disconnect()
      mo?.disconnect()
      io = null
      mo = null
    }

    // ----- wiring -----
    void (async () => {
      settings = await getSettings()
      floating = await mountFloatingUi(ctx).catch((err) => {
        // The annotation pipeline must survive a floating-UI failure.
        console.warn('[ppl] floating UI mount failed', err)
        return null
      })
      unwatch = settingsItem.watch((s) => {
        settings = s ?? settings
        if (settings) applyEnabled(settings.enabled)
      })
      if (!isAllowed()) return
      applyEnabled(settings.enabled)
    })()

    document.addEventListener('click', onDocumentClick)

    browser.runtime.onMessage.addListener((msg: unknown) => {
      if (!msg || typeof msg !== 'object') return
      const m = msg as Record<string, unknown>
      if (m.type === 'enabled-toggled') applyEnabled(!!m.enabled)
      else if (m.type === 'remeasure') location.reload()
      // 'ping' is answered implicitly (listener == alive signal)
    })

    ctx.addEventListener(window, 'pagehide', () => {
      stop()
      unwatch?.()
      document.removeEventListener('click', onDocumentClick)
      floating?.remove()
      floating = null
    })
  },
})
