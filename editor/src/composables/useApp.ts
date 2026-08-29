// ---------- Application controller ----------
// Owns the CodeMirror editor instance and the analysis state machine, and exposes
// reactive state that components bind to. Module-level singleton: components import
// the same instance, so there is no prop drilling for shared, derived state.
import { reactive } from 'vue'
import { createEditor, type EditorApi } from '../editor.ts'
import { createApi } from '../api.ts'
import { settings } from './useSettings.ts'
import { hashText, buildCpToUtf16Map, debounce } from '../util.ts'
import { avgNllOfTokens, isIgnored, mergeIgnoreRanges } from '../chunks.ts'
import { toast } from './useToasts.ts'
import { t } from '../i18n.ts'
import type { HealthResponse } from '../types.ts'

export type ModalKind = 'settings' | 'savePreset' | 'managePresets' | 'ignoreList'

interface AppState {
  health: HealthResponse | null // GET /health result, null = offline
  elapsedMs: number | null // duration of the last PPL computation
  tokenCount: number | null // token count of the last analysis
  maxChars: number // backend char limit (default, updated after /health)
  inFlight: boolean // whether a request is in flight
  pendingAnalyze: boolean // whether another analysis was requested mid-flight
  ignoreCount: number
  charCount: number
  cursorLine: number
  cursorCol: number
  avgNll: number | null
  avgPpl: number | null
  coverage: number | null
  drawTick: number // bumped whenever the histogram must redraw
  activeModal: ModalKind | null
}

const state = reactive<AppState>({
  health: null,
  elapsedMs: null,
  tokenCount: null,
  maxChars: 2200,
  inFlight: false,
  pendingAnalyze: false,
  ignoreCount: 0,
  charCount: 0,
  cursorLine: 1,
  cursorCol: 1,
  avgNll: null,
  avgPpl: null,
  coverage: null,
  drawTick: 0,
  activeModal: null
})

const api = createApi(() => settings.serverUrl)

let editor: EditorApi | null = null

// ---------- Analysis flow ----------
async function analyze(manual = false): Promise<void> {
  if (!editor) return
  const text = editor.view.state.doc.toString()
  if (!text.trim()) {
    if (manual) toast(t('toast.textEmpty'), 'warn')
    return
  }
  if (text.length > state.maxChars) {
    if (manual) toast(t('toast.textTooLong', { len: text.length, max: state.maxChars }), 'warn')
    return
  }
  if (state.inFlight) {
    // Do not resubmit while a request is in flight; record a single pending request.
    state.pendingAnalyze = true
    return
  }
  state.inFlight = true
  // Hash the text before sending; drop the response if the document changed meanwhile,
  // so colors are never applied to the wrong positions.
  const sendHash = hashText(text)
  const cpMap = buildCpToUtf16Map(text)
  const t0 = performance.now()
  try {
    const data = await api.ppl(text)
    state.elapsedMs = performance.now() - t0
    if (!editor || hashText(editor.view.state.doc.toString()) !== sendHash) {
      // Text was edited while waiting: discard the result; auto-refresh resends.
      if (settings.autoRefresh) state.pendingAnalyze = true
      return
    }
    editor.applyAnalysis(data, cpMap)
    state.tokenCount = data.token_count
    refreshDerived()
    if (state.health == null) void checkHealth()
  } catch (err) {
    const maybe = err as { status?: number; message?: string } | null
    if (maybe?.status) {
      toast(t('toast.analyzeFailed', { msg: maybe.message ?? '' }), 'error')
    } else {
      toast(t('toast.noBackend', { url: settings.serverUrl }), 'error')
      state.health = null
    }
  } finally {
    state.inFlight = false
    refreshStats()
    updateCursor()
    if (state.pendingAnalyze) {
      state.pendingAnalyze = false
      if (settings.autoRefresh) scheduleAutoAnalyze()
    }
  }
}

const scheduleAutoAnalyze = debounce(() => analyze(false), 800)

// ---------- Ignore list ----------
function addIgnoreFromSelection(): void {
  if (!editor) return
  const sel = editor.view.state.selection.main
  if (sel.empty) {
    toast(t('toast.selectFirst'), 'warn')
    return
  }
  editor.addIgnore(sel.from, sel.to)
  state.ignoreCount = editor.getIgnores().length
  refreshDerived()
  toast(t('toast.ignored', { n: sel.to - sel.from }))
}

function removeIgnoreAt(index: number): void {
  if (!editor) return
  const ranges = editor.getIgnores().slice()
  ranges.splice(index, 1)
  setIgnores(ranges)
}

function clearIgnores(): void {
  setIgnores([])
}

function setIgnores(ranges: Array<{ start: number; end: number }>): void {
  if (!editor) return
  editor.setIgnores(ranges)
  state.ignoreCount = editor.getIgnores().length
  refreshDerived()
}

// ---------- Derived data refresh (status bar / histogram) ----------
function refreshDerived(): void {
  refreshStats()
  updateCursor()
  state.drawTick++
}

/** Refresh the caret line/column only. Cheap: no full text materialization. */
function updateCursor(): void {
  if (!editor) return
  const view = editor.view
  const doc = view.state.doc
  const head = view.state.selection.main.head
  const line = doc.lineAt(head)
  state.cursorLine = line.number
  state.cursorCol = head - line.from + 1
}

/** Recompute the document aggregate statistics shown in the status bar. */
function refreshStats(): void {
  if (!editor) return
  const doc = editor.view.state.doc
  const len = doc.length
  const tokens = editor.getTokens()
  const merged = mergeIgnoreRanges(editor.getIgnores())
  const stat = avgNllOfTokens(tokens, merged)
  // Coverage: chars covered by measured (non-stale) tokens / total chars.
  let covered = 0
  for (const tk of tokens) {
    if (!tk.stale && !isIgnored(tk.start, tk.end, merged)) covered += Math.max(0, tk.end - tk.start)
  }
  state.charCount = len
  state.avgNll = stat ? stat.nll : null
  state.avgPpl = stat ? stat.ppl : null
  state.coverage = len ? Math.min(100, (covered / len) * 100) : null
}

// ---------- Health check ----------
async function checkHealth(): Promise<void> {
  const h = await api.health()
  state.health = h
  if (h && h.max_char_count) state.maxChars = h.max_char_count
  refreshStats()
}

let healthPollTimer: ReturnType<typeof setInterval> | null = null

function startHealthPolling(): void {
  // Idempotent: drop any previous timer before installing a fresh one.
  if (healthPollTimer != null) clearInterval(healthPollTimer)
  void checkHealth()
  healthPollTimer = setInterval(() => void checkHealth(), 15000)
}

/** Clear the periodic health poll. Safe to call anytime (destroy, restart, unmount). */
function stopHealthPolling(): void {
  if (healthPollTimer != null) {
    clearInterval(healthPollTimer)
    healthPollTimer = null
  }
}

// ---------- Setting change hooks ----------
function settingsChanged(): void {
  editor?.refreshDecorations()
  refreshDerived()
}

function fontChanged(): void {
  editor?.applyFonts()
}

function serverChanged(): void {
  void checkHealth()
}

function autoRefreshChanged(on: boolean): void {
  if (on) scheduleAutoAnalyze()
}

// ---------- Editor lifecycle ----------
function initEditor(parent: HTMLElement): void {
  editor = createEditor(parent, {
    onDocChanged: () => {
      refreshStats()
      updateCursor()
      if (settings.autoRefresh) scheduleAutoAnalyze()
    },
    onSelectionChanged: () => updateCursor(),
    onAnalyze: () => analyze(true)
  }, () => settings)
  refreshDerived()
}

function destroyEditor(): void {
  stopHealthPolling()
  editor?.view.destroy()
  editor = null
}

// ---------- Exposed API ----------
export function useApp(): {
  state: typeof state
  initEditor: (parent: HTMLElement) => void
  destroyEditor: () => void
  analyze: (manual?: boolean) => Promise<void>
  addIgnoreFromSelection: () => void
  removeIgnoreAt: (index: number) => void
  clearIgnores: () => void
  undo: () => void
  redo: () => void
  settingsChanged: () => void
  fontChanged: () => void
  serverChanged: () => void
  autoRefreshChanged: (on: boolean) => void
  openModal: (kind: ModalKind) => void
  closeModal: () => void
  getTokens: () => ReturnType<NonNullable<EditorApi>['getTokens']>
  documentText: () => string
  getIgnores: () => Array<{ start: number; end: number }>
  startHealthPolling: () => void
  stopHealthPolling: () => void
} {
  return {
    state,
    initEditor,
    destroyEditor,
    analyze,
    addIgnoreFromSelection,
    removeIgnoreAt,
    clearIgnores,
    undo: () => editor?.undo(),
    redo: () => editor?.redo(),
    settingsChanged,
    fontChanged,
    serverChanged,
    autoRefreshChanged,
    openModal: (kind) => {
      state.activeModal = kind
    },
    closeModal: () => {
      state.activeModal = null
    },
    getTokens: () => editor?.getTokens() ?? [],
    documentText: () => editor?.view.state.doc.toString() ?? '',
    getIgnores: () => editor?.getIgnores() ?? [],
    startHealthPolling,
    stopHealthPolling
  }
}