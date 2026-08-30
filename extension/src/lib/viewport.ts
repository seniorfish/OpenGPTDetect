// ---------- Viewport-followed lazy measurement + dynamic-DOM re-scan ----------
import type { MeasurementUnit } from './dom-scan.ts'

export interface InitialPicker {
  words: number
  unit: MeasurementUnit
}

/** IntersectionObserver that fires once per element when it enters the view. */
export function createObserver(
  rootMargin: string,
  onIntersect: (el: Element) => void,
): IntersectionObserver {
  return new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) onIntersect(e.target)
      }
    },
    { rootMargin: rootMargin || '600px', root: null, threshold: 0 }
  )
}

/** From the top, pick units until the accumulated word count reaches `words`. */
export function pickInitial(candidates: InitialPicker[], words: number): InitialPicker[] {
  const out: InitialPicker[] = []
  let acc = 0
  for (const c of candidates) {
    out.push(c)
    acc += c.words
    if (acc >= words) break
  }
  return out
}

/** Watch for added DOM nodes and debounce-call `onMutated` (for a re-scan). */
export function startMutationWatch(onMutated: () => void): MutationObserver {
  let timer: ReturnType<typeof setTimeout> | null = null
  const mo = new MutationObserver((muts) => {
    let hasNew = false
    for (const m of muts) {
      if (m.addedNodes && m.addedNodes.length) {
        hasNew = true
        break
      }
    }
    if (!hasNew) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      try {
        onMutated()
      } catch {
        // ignore observer errors
      }
    }, 400)
  })
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true })
  return mo
}
