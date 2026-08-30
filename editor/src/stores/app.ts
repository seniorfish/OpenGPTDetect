// ---------- Application controller store ----------
// Owns the CodeMirror editor instance and the analysis orchestration (migrated
// from the Vue `useApp` composable). The document's data — text, tokens,
// ignores — stays in CodeMirror's `hmField` (its single source of truth); this
// store keeps only facts (status, counters, flags) plus two version counters:
// `drawTick` (document metrics to re-derive) and `cursorTick` (caret metrics).
// Components derive the displayed bars/stats from the editor on each tick, so
// no derived state is mirrored into this store.
import { create } from 'zustand'
import { createEditor, type EditorApi } from '../editor.ts'
import { createApi, createFetchTransport } from '@opengptdetect/core'
import { hashText, buildCpToUtf16Map, debounce } from '../util.ts'
import { useSettingsStore } from './settings.ts'
import { toast } from '../composables/useToasts.ts'
import { t } from '../i18n.ts'
import type { HealthResponse } from '@opengptdetect/core'
import type { Range as DocRange, Token } from '../types.ts'

export type ModalKind = 'settings' | 'savePreset' | 'managePresets'

export interface AppStore {
  health: HealthResponse | null // GET /health result, null = offline
  elapsedMs: number | null // duration of the last PPL computation
  tokenCount: number | null // token count of the last analysis
  maxChars: number // backend char limit (default, updated after /health)
  inFlight: boolean // whether a request is in flight
  pendingAnalyze: boolean // whether another analysis was requested mid-flight
  ignoreCount: number
  activeModal: ModalKind | null
  drawTick: number // bumped whenever the status/histogram must re-derive
  cursorTick: number // bumped whenever the caret metrics must re-derive
  editor: EditorApi | null

  // Lifecycle
  initEditor: (parent: HTMLElement) => void
  destroyEditor: () => void
  startHealthPolling: () => void
  stopHealthPolling: () => void
  analyze: (manual?: boolean) => Promise<void>

  // Ignore list
  addIgnoreFromSelection: () => void
  removeIgnoreAt: (index: number) => void
  clearIgnores: () => void
  setIgnores: (ranges: DocRange[]) => void

  // Misc actions
  undo: () => void
  redo: () => void
  openModal: (kind: ModalKind) => void
  closeModal: () => void

  // Editor readers (safe even while null)
  getTokens: () => Token[]
  getIgnores: () => DocRange[]
  documentText: () => string
}

const api = createApi(createFetchTransport(), () => useSettingsStore.getState().settings.serverUrl)

// Module-scoped (non-store) handles for side-effect lifecycles.
let healthPollTimer: ReturnType<typeof setInterval> | null = null
let settingsUnsub: (() => void) | null = null

export const useAppStore = create<AppStore>((set, get) => {
  // ---------- Version ticks (trigger React re-derivation) ----------
  function bumpDraw(): void {
    set({ drawTick: get().drawTick + 1 })
  }
  function bumpCursor(): void {
    set({ cursorTick: get().cursorTick + 1 })
  }

  // ---------- Health check & polling ----------
  async function checkHealth(): Promise<void> {
    const h = await api.health()
    const cur = get()
    set({
      health: h,
      maxChars: h?.max_char_count ? h.max_char_count : cur.maxChars
    })
    bumpDraw()
  }

  function startHealthPolling(): void {
    // Idempotent: drop any previous timer before installing a fresh one.
    if (healthPollTimer != null) clearInterval(healthPollTimer)
    void checkHealth()
    healthPollTimer = setInterval(() => void checkHealth(), 15000)
  }

  function stopHealthPolling(): void {
    if (healthPollTimer != null) {
      clearInterval(healthPollTimer)
      healthPollTimer = null
    }
  }

  // ---------- Analysis flow ----------
  const scheduleAutoAnalyze = debounce(() => {
    void get().analyze(false)
  }, 800)

  async function analyze(manual = false): Promise<void> {
    const editor = get().editor
    if (!editor) return
    const { settings } = useSettingsStore.getState()
    const text = editor.view.state.doc.toString()
    if (!text.trim()) {
      if (manual) toast(t('toast.textEmpty'), 'warn')
      return
    }
    if (text.length > get().maxChars) {
      if (manual) toast(t('toast.textTooLong', { len: text.length, max: get().maxChars }), 'warn')
      return
    }
    if (get().inFlight) {
      // Do not resubmit while a request is in flight; record a single pending request.
      set({ pendingAnalyze: true })
      return
    }
    set({ inFlight: true })
    // Hash the text before sending; drop the response if the document changed
    // meanwhile, so colors are never applied to the wrong positions.
    const sendHash = hashText(text)
    const cpMap = buildCpToUtf16Map(text)
    const t0 = performance.now()
    try {
      const data = await api.ppl(text)
      const elapsedMs = performance.now() - t0
      const curEditor = get().editor
      if (!curEditor || hashText(curEditor.view.state.doc.toString()) !== sendHash) {
        // Text was edited while waiting: discard; auto-refresh resends.
        if (useSettingsStore.getState().settings.autoRefresh) set({ pendingAnalyze: true })
        return
      }
      curEditor.applyAnalysis(data, cpMap)
      set({ elapsedMs, tokenCount: data.token_count })
      // New tokens landed in the editor: nudge the draw/cursor ticks so derived
      // status bars (avg NLL, coverage) re-compute.
      bumpDraw()
      if (get().health == null) void checkHealth()
    } catch (err) {
      const maybe = err as { status?: number; message?: string } | null
      if (maybe?.status) {
        toast(t('toast.analyzeFailed', { msg: maybe.message ?? '' }), 'error')
      } else {
        toast(t('toast.noBackend', { url: useSettingsStore.getState().settings.serverUrl }), 'error')
        set({ health: null })
      }
    } finally {
      const current = get()
      set({ inFlight: false })
      if (current.pendingAnalyze) {
        set({ pendingAnalyze: false })
        if (useSettingsStore.getState().settings.autoRefresh) scheduleAutoAnalyze()
      }
    }
  }

  // ---------- Ignore list ----------
  function addIgnoreFromSelection(): void {
    const editor = get().editor
    if (!editor) return
    const sel = editor.view.state.selection.main
    if (sel.empty) {
      toast(t('toast.selectFirst'), 'warn')
      return
    }
    editor.addIgnore(sel.from, sel.to)
    set({ ignoreCount: editor.getIgnores().length })
    bumpDraw()
    toast(t('toast.ignored', { n: sel.to - sel.from }))
  }

  function removeIgnoreAt(index: number): void {
    const editor = get().editor
    if (!editor) return
    const ranges = editor.getIgnores().slice()
    ranges.splice(index, 1)
    setIgnores(ranges)
  }

  function clearIgnores(): void {
    setIgnores([])
  }

  function setIgnores(ranges: DocRange[]): void {
    const editor = get().editor
    if (!editor) return
    editor.setIgnores(ranges)
    set({ ignoreCount: editor.getIgnores().length })
    bumpDraw()
  }

  // ---------- Editor lifecycle ----------
  function initEditor(parent: HTMLElement): void {
    const editor = createEditor(
      parent,
      {
        onDocChanged: () => {
          if (useSettingsStore.getState().settings.autoRefresh) scheduleAutoAnalyze()
          bumpDraw()
          bumpCursor()
        },
        onSelectionChanged: () => bumpCursor(),
        onAnalyze: () => void get().analyze(true),
        onIgnoreSelection: () => get().addIgnoreFromSelection()
      },
      () => useSettingsStore.getState().settings
    )
    set({ editor })
    bumpDraw()

    // React to setting changes in one place: refresh the editor's decoration or
    // fonts, probe a new server URL, or reschedule auto-refresh when it turns on.
    settingsUnsub = useSettingsStore.subscribe((next, prev) => {
      const n = next.settings
      const p = prev.settings
      const ed = get().editor
      const fontChanged = n.fontFamily !== p.fontFamily || n.fontSize !== p.fontSize
      const styleChanged =
        n.stops !== p.stops || n.chunkMode !== p.chunkMode || n.style !== p.style ||
        n.opacity !== p.opacity || n.windowN !== p.windowN || n.windowM !== p.windowM ||
        n.windowWidth !== p.windowWidth
      if (ed) {
        if (fontChanged) {
          ed.applyFonts()
        } else if (styleChanged) {
          ed.refreshDecorations()
          // The histogram is drawn from settings too, so a style/window change
          // must re-derive it as well.
          bumpDraw()
        }
      }
      if (n.serverUrl !== p.serverUrl) void checkHealth()
      if (n.autoRefresh && !p.autoRefresh) scheduleAutoAnalyze()
    })
  }

  function destroyEditor(): void {
    stopHealthPolling()
    settingsUnsub?.()
    settingsUnsub = null
    get().editor?.view.destroy()
    set({ editor: null })
  }

  // ---------- Store ----------
  return {
    health: null,
    elapsedMs: null,
    tokenCount: null,
    maxChars: 2200,
    inFlight: false,
    pendingAnalyze: false,
    ignoreCount: 0,
    activeModal: null,
    drawTick: 0,
    cursorTick: 0,
    editor: null,

    initEditor,
    destroyEditor,
    startHealthPolling,
    stopHealthPolling,
    analyze,

    addIgnoreFromSelection,
    removeIgnoreAt,
    clearIgnores,
    setIgnores,

    undo: () => get().editor?.undo(),
    redo: () => get().editor?.redo(),
    openModal: (kind) => set({ activeModal: kind }),
    closeModal: () => set({ activeModal: null }),

    getTokens: () => get().editor?.getTokens() ?? [],
    getIgnores: () => get().editor?.getIgnores() ?? [],
    documentText: () => get().editor?.view.state.doc.toString() ?? ''
  }
})