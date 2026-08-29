// ---------- 入口：装配编辑器、UI 与分析流程 ----------

import './style.css'
import { createEditor } from './editor.ts'
import { createUI } from './ui.ts'
import { createApi } from './api.ts'
import { settings, saveSettings } from './store.ts'
import { hashText, buildCpToUtf16Map, debounce } from './util.ts'
import { markIgnored, avgNllOfTokens } from './chunks.ts'
import type { HealthResponse } from './types.ts'

interface MainState {
  health: HealthResponse | null // /health 返回，null = 离线
  elapsedMs: number | null // 上次 PPL 计算耗时
  tokenCount: number | null // 上次分析的 token 数
  inFlight: boolean // 是否有请求在飞
  pendingAnalyze: boolean // 在飞期间是否又有新的分析需求
  maxChars: number // 后端字符上限（默认，健康检查后更新）
}

const state: MainState = {
  health: null,
  elapsedMs: null,
  tokenCount: null,
  inFlight: false,
  pendingAnalyze: false,
  maxChars: 2200
}

const api = createApi(() => settings.serverUrl)

// ---------- 编辑器 ----------
const ui = createUI({
  onAnalyze: (manual) => analyze(manual),
  onUndo: () => editor.undo(),
  onRedo: () => editor.redo(),
  onAddIgnore: addIgnoreFromSelection,
  getIgnores: () => editor.getIgnores(),
  setIgnores: (ranges) => {
    editor.setIgnores(ranges)
    ui.setIgnoreCount(ranges.length)
    refreshDerived()
  },
  getDocText: () => editor.view.state.doc.toString(),
  onSettingsChanged: () => {
    editor.refreshDecorations()
    refreshDerived()
  },
  onFontChanged: () => editor.applyFonts(),
  onServerChanged: () => checkHealth(),
  onAutoRefreshChanged: (on) => {
    if (on) scheduleAutoAnalyze()
  },
  onResize: () => ui.renderHistogram(editor.getTokens())
})

const editor = createEditor(ui.editorWrap, {
  onDocChanged: () => {
    updateStatusBar()
    ui.renderHistogram(editor.getTokens())
    if (settings.autoRefresh) scheduleAutoAnalyze()
  },
  onSelectionChanged: () => updateStatusBar(),
  onAnalyze: () => analyze(true)
})

// ---------- 分析流程 ----------
async function analyze(manual = false): Promise<void> {
  const text = editor.view.state.doc.toString()
  if (!text.trim()) {
    if (manual) ui.toast('文本为空，无法分析', 'warn')
    return
  }
  if (text.length > state.maxChars) {
    if (manual) ui.toast(`文本 ${text.length} 字符，超过后端的分析上限 ${state.maxChars}，请删减后再试`, 'warn')
    return
  }
  if (state.inFlight) {
    // 上一个结果返回前不重复提交；记录一次待办即可
    state.pendingAnalyze = true
    return
  }
  state.inFlight = true
  ui.setBusy(true)
  // 发出请求时记录文本哈希，响应回来先比对，不一致就丢弃，避免颜色贴错位置
  const sendHash = hashText(text)
  const cpMap = buildCpToUtf16Map(text)
  const t0 = performance.now()
  try {
    const data = await api.ppl(text)
    state.elapsedMs = performance.now() - t0
    if (hashText(editor.view.state.doc.toString()) !== sendHash) {
      // 等待期间文本被改过：结果作废；自动刷新模式下立即补发
      if (settings.autoRefresh) state.pendingAnalyze = true
      return
    }
    editor.applyAnalysis(data, cpMap)
    state.tokenCount = data.token_count
    refreshDerived()
    if (state.health == null) checkHealth()
  } catch (err) {
    const maybe = err as { status?: number; message?: string } | null
    if (maybe?.status) {
      ui.toast(`分析失败：${maybe.message}`, 'error')
    } else {
      ui.toast(`无法连接后端 ${settings.serverUrl}`, 'error')
      state.health = null
    }
  } finally {
    state.inFlight = false
    ui.setBusy(false)
    updateStatusBar()
    if (state.pendingAnalyze) {
      state.pendingAnalyze = false
      if (settings.autoRefresh) scheduleAutoAnalyze()
    }
  }
}

const scheduleAutoAnalyze = debounce(() => analyze(false), 800)

// ---------- 忽略清单 ----------
function addIgnoreFromSelection(): void {
  const sel = editor.view.state.selection.main
  if (sel.empty) {
    ui.toast('请先选中要忽略的文字', 'warn')
    return
  }
  editor.addIgnore(sel.from, sel.to)
  ui.setIgnoreCount(editor.getIgnores().length)
  refreshDerived()
  ui.toast(`已忽略选区（${sel.to - sel.from} 字符），该段不参与统计`)
}

// ---------- 派生数据刷新（直方图 / 状态栏） ----------
function refreshDerived(): void {
  ui.renderHistogram(editor.getTokens())
  updateStatusBar()
}

function updateStatusBar(): void {
  const doc = editor.view.state.doc
  const text = doc.toString()
  const tokens = editor.getTokens()
  const ignores = editor.getIgnores()
  markIgnored(tokens, ignores)
  const stat = avgNllOfTokens(tokens)
  // 覆盖率：已测量（非脏）Token 覆盖的字符 / 总字符
  let covered = 0
  for (const t of tokens) {
    if (!t.stale && !t.ignored) covered += Math.max(0, t.end - t.start)
  }
  const head = editor.view.state.selection.main.head
  const line = doc.lineAt(head)
  ui.updateStatusBar({
    charCount: text.length,
    tokenCount: state.tokenCount,
    elapsedMs: state.elapsedMs,
    health: state.health,
    avgNll: stat ? stat.nll : null,
    avgPpl: stat ? stat.ppl : null,
    coverage: text.length ? Math.min(100, (covered / text.length) * 100) : null,
    line: line.number,
    col: head - line.from + 1
  })
}

// ---------- 健康检查 ----------
async function checkHealth(): Promise<void> {
  const h = await api.health()
  state.health = h
  if (h && h.max_char_count) state.maxChars = h.max_char_count
  updateStatusBar()
}
void checkHealth()
setInterval(() => void checkHealth(), 15000)

// ---------- 初始化 ----------
ui.syncControls()
ui.setIgnoreCount(0)
ui.renderHistogram([])
updateStatusBar()