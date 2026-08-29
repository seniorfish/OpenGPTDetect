// ---------- UI：工具栏 / 状态栏 / 弹窗 / 直方图 ----------

import {
  settings, saveSettings, loadPresets, savePreset, deletePreset, renamePreset,
  presetFromSettings, applyPreset
} from './store.ts'
import { clamp, fmtNum, escapeHtml, colorForPpl } from './util.ts'
import type { Token, Range, HealthResponse } from './types.ts'

export type ToastType = 'info' | 'warn' | 'error'

export interface UIHandlers {
  onAnalyze: (manual: boolean) => void
  onUndo: () => void
  onRedo: () => void
  onAddIgnore: () => void
  getIgnores: () => Range[]
  setIgnores: (ranges: Range[]) => void
  getDocText: () => string
  onSettingsChanged: () => void
  onFontChanged: () => void
  onServerChanged: () => void
  onAutoRefreshChanged: (on: boolean) => void
  onResize: () => void
}

export interface StatusBarStats {
  charCount: number
  tokenCount: number | null
  elapsedMs: number | null
  health: HealthResponse | null
  avgNll: number | null
  avgPpl: number | null
  coverage: number | null
  line: number
  col: number
}

export interface UI {
  editorWrap: HTMLElement
  toast: (msg: string, type?: ToastType) => void
  openModal: (title: string, buildContent: (body: HTMLElement, close: () => void) => void) => void
  closeModal: () => void
  renderHistogram: (tokens: Token[]) => void
  updateStatusBar: (s: StatusBarStats) => void
  syncControls: () => void
  setIgnoreCount: (n: number) => void
  setBusy: (busy: boolean) => void
  refreshPresetOptions: () => void
}

interface HistoScale {
  x: (ppl: number) => number
  invX: (px: number) => number
  lo: number
  hi: number
  W: number
}

export function createUI(handlers: UIHandlers): UI {
  const $ = <T extends Element>(id: string): T => document.getElementById(id) as unknown as T
  const app = $<HTMLDivElement>('app')
  app.innerHTML = `
    <div class="toolbar">
      <button id="btn-analyze" class="primary" title="发送全文到后端计算 PPL（Ctrl+Enter）">分析</button>
      <label class="chk" title="启用后，文本变化会自动重新计算（上一个请求返回前不会重复发请求）">
        <input type="checkbox" id="chk-auto" /> 自动刷新
      </label>
      <span class="sep"></span>
      <button id="btn-undo" title="撤销 (Ctrl+Z)">↶ 撤销</button>
      <button id="btn-redo" title="重做 (Ctrl+Y)">↷ 重做</button>
      <span class="sep"></span>
      <label class="lbl" title="热力图的分块粒度">分块
        <select id="sel-mode">
          <option value="token">Token</option>
          <option value="sentence">句子</option>
          <option value="paragraph">段落</option>
        </select>
      </label>
      <span class="sep"></span>
      <button id="btn-ignore" title="把当前选中的文字加入忽略清单（仍发送给模型作为上下文，但不参与任何统计）">忽略选区</button>
      <button id="btn-ignore-list" title="查看 / 管理忽略清单">忽略清单 <span id="ignore-count">0</span></button>
      <span class="sep"></span>
      <label class="lbl" title="载入颜色配置方案">方案
        <select id="sel-preset"></select>
      </label>
      <button id="btn-save-preset" title="把当前颜色/样式配置保存为一个方案">存为方案</button>
      <button id="btn-manage-preset" title="重命名 / 删除方案">管理</button>
      <span class="sep"></span>
      <button id="btn-settings" title="颜色节点、呈现样式、字体、后端地址等">⚙ 设置</button>
    </div>
    <div class="editor-wrap" id="editor-wrap"></div>
    <div class="histo-panel" id="histo-panel">
      <div class="histo-controls">
        <span class="histo-title">PPL 分布 / 分层显示（仅 Token 模式生效）</span>
        <button id="btn-win-down" title="窗口向低 PPL 方向移动一个宽度">◀ 下移窗口</button>
        <button id="btn-win-up" title="窗口向高 PPL 方向移动一个宽度">上移窗口 ▶</button>
        <button id="btn-win-top" title="只显示 PPL 最高的一个窗口">最高 <span id="win-w-label">10</span>%</button>
        <button id="btn-win-all" title="显示全部（0%–100%）">全部</button>
        <label class="lbl">宽度
          <select id="sel-win-w">
            <option value="5">5%</option>
            <option value="10" selected>10%</option>
            <option value="20">20%</option>
            <option value="custom">自定义…</option>
          </select>
        </label>
        <input id="inp-win-w" type="number" min="1" max="100" step="1" style="display:none" title="自定义窗口宽度（%）" />
        <span id="window-label" class="window-label">窗口 0%–100%</span>
      </div>
      <svg id="histogram" preserveAspectRatio="none"></svg>
      <div class="histo-hint">在直方图上拖拽可框选分层窗口</div>
    </div>
    <div class="statusbar" id="statusbar">
      <span class="st" id="st-chars" title="当前文档总字符数（实时更新）">字符 0</span>
      <span class="st clickable" id="st-tokens" title="上次分析返回的 Token 总数（随 PPL 计算更新）。点击重新分析">Token —</span>
      <span class="st" id="st-elapsed" title="上一次 PPL 计算耗时">耗时 —</span>
      <span class="st" id="st-backend" title="后端服务状态（GET /health）">后端 …</span>
      <span class="st" id="st-nll" title="文档整体平均 NLL（自然对数；仅统计已测量且未忽略的 Token）">平均 NLL —</span>
      <span class="st" id="st-ppl" title="文档整体平均 PPL = exp(平均 NLL)；字体颜色与热力图配色一致">平均 PPL —</span>
      <span class="st" id="st-cov" title="测量覆盖率：已测量且未失效 Token 覆盖的字符 / 总字符">覆盖率 —</span>
      <span class="st" id="st-pos" title="光标所在行、列">行 1, 列 1</span>
    </div>
    <div class="modal-overlay" id="modal-overlay" style="display:none">
      <div class="modal" id="modal-box"></div>
    </div>
    <div class="toast" id="toast" style="display:none"></div>
  `

  const els = {
    analyze: $<HTMLButtonElement>('btn-analyze'), auto: $<HTMLInputElement>('chk-auto'),
    undo: $<HTMLButtonElement>('btn-undo'), redo: $<HTMLButtonElement>('btn-redo'),
    mode: $<HTMLSelectElement>('sel-mode'), ignore: $<HTMLButtonElement>('btn-ignore'),
    ignoreList: $<HTMLButtonElement>('btn-ignore-list'), ignoreCount: $<HTMLSpanElement>('ignore-count'),
    preset: $<HTMLSelectElement>('sel-preset'), savePreset: $<HTMLButtonElement>('btn-save-preset'),
    managePreset: $<HTMLButtonElement>('btn-manage-preset'), settings: $<HTMLButtonElement>('btn-settings'),
    editorWrap: $<HTMLDivElement>('editor-wrap'), histoPanel: $<HTMLDivElement>('histo-panel'),
    histogram: $<SVGSVGElement>('histogram'),
    winDown: $<HTMLButtonElement>('btn-win-down'), winUp: $<HTMLButtonElement>('btn-win-up'),
    winTop: $<HTMLButtonElement>('btn-win-top'), winAll: $<HTMLButtonElement>('btn-win-all'),
    winW: $<HTMLSelectElement>('sel-win-w'), winWInput: $<HTMLInputElement>('inp-win-w'),
    winWLabel: $<HTMLSpanElement>('win-w-label'), windowLabel: $<HTMLSpanElement>('window-label'),
    overlay: $<HTMLDivElement>('modal-overlay'), modalBox: $<HTMLDivElement>('modal-box'), toast: $<HTMLDivElement>('toast'),
    stChars: $<HTMLSpanElement>('st-chars'), stTokens: $<HTMLSpanElement>('st-tokens'),
    stElapsed: $<HTMLSpanElement>('st-elapsed'), stBackend: $<HTMLSpanElement>('st-backend'),
    stNll: $<HTMLSpanElement>('st-nll'), stPpl: $<HTMLSpanElement>('st-ppl'),
    stCov: $<HTMLSpanElement>('st-cov'), stPos: $<HTMLSpanElement>('st-pos')
  }

  // ---------- Toast ----------
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  function toast(msg: string, type: ToastType = 'info'): void {
    els.toast.textContent = msg
    els.toast.className = `toast ${type}`
    els.toast.style.display = 'block'
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (els.toast.style.display = 'none'), 4500)
  }

  // ---------- 弹窗 ----------
  function openModal(title: string, buildContent: (body: HTMLElement, close: () => void) => void): void {
    els.modalBox.innerHTML = `<div class="modal-head"><span>${escapeHtml(title)}</span><button class="modal-close">✕</button></div><div class="modal-body"></div>`
    const body = els.modalBox.querySelector('.modal-body') as HTMLElement
    buildContent(body, closeModal)
    const closeBtn = els.modalBox.querySelector('.modal-close') as HTMLButtonElement
    closeBtn.onclick = closeModal
    els.overlay.style.display = 'flex'
  }
  function closeModal(): void {
    els.overlay.style.display = 'none'
  }
  els.overlay.addEventListener('mousedown', (e) => {
    if (e.target === els.overlay) closeModal()
  })

  // ---------- 预设下拉 ----------
  function refreshPresetOptions(): void {
    const presets = loadPresets()
    els.preset.innerHTML = '<option value="">（选择方案…）</option>' +
      Object.keys(presets).map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')
  }
  refreshPresetOptions()
  els.preset.onchange = () => {
    const name = els.preset.value
    if (!name) return
    const preset = loadPresets()[name]
    if (preset) {
      applyPreset(preset)
      handlers.onSettingsChanged()
      syncControls()
      toast(`已载入方案「${name}」`)
    }
  }

  els.savePreset.onclick = () => {
    openModal('保存配置方案', (body, close) => {
      body.innerHTML = `
        <div class="form-row"><label>方案名称</label><input id="preset-name" type="text" placeholder="例如：我的方案" /></div>
        <div class="form-actions"><button class="primary" id="do-save">保存</button></div>`
      const input = body.querySelector('#preset-name') as HTMLInputElement
      input.focus()
      const doSave = (): void => {
        const name = input.value.trim()
        if (!name) return toast('请输入方案名称', 'warn')
        savePreset(name, presetFromSettings(name))
        refreshPresetOptions()
        els.preset.value = name
        close()
        toast(`方案「${name}」已保存`)
      }
      const btn = body.querySelector('#do-save') as HTMLButtonElement
      btn.onclick = doSave
      input.onkeydown = (e) => { if (e.key === 'Enter') doSave() }
    })
  }

  els.managePreset.onclick = () => {
    openModal('管理配置方案', (body, close) => {
      const render = (): void => {
        const presets = loadPresets()
        const names = Object.keys(presets)
        body.innerHTML = names.length
          ? names.map((n) => `
            <div class="preset-row" data-name="${escapeHtml(n)}">
              <span class="preset-name">${escapeHtml(n)}</span>
              <button data-act="load">载入</button>
              <button data-act="rename">重命名</button>
              <button data-act="del" class="danger">删除</button>
            </div>`).join('')
          : '<div class="tip-dim">暂无方案</div>'
        body.querySelectorAll('.preset-row').forEach((row) => {
          const name = (row as HTMLElement).dataset.name as string
          row.querySelectorAll('button').forEach((btn) => {
            btn.onclick = () => {
              const act = btn.dataset.act
              if (act === 'load') {
                applyPreset(presets[name])
                handlers.onSettingsChanged()
                syncControls()
                close()
                toast(`已载入方案「${name}」`)
              } else if (act === 'del') {
                deletePreset(name)
                refreshPresetOptions()
                render()
              } else if (act === 'rename') {
                const span = row.querySelector('.preset-name') as HTMLElement
                const input = document.createElement('input')
                input.type = 'text'
                input.value = name
                span.replaceWith(input)
                input.focus()
                const commit = (): void => {
                  const nn = input.value.trim()
                  if (nn && nn !== name) {
                    renamePreset(name, nn)
                    refreshPresetOptions()
                  }
                  render()
                }
                input.onblur = commit
                input.onkeydown = (e) => { if (e.key === 'Enter') commit() }
              }
            }
          })
        })
      }
      render()
    })
  }

  // ---------- 设置弹窗 ----------
  els.settings.onclick = () => {
    openModal('设置', (body) => {
      body.innerHTML = `
        <div class="form-row"><label>后端地址</label><input id="set-url" type="text" value="${escapeHtml(settings.serverUrl)}" /></div>
        <div class="form-row"><label>呈现样式</label>
          <select id="set-style">
            <option value="background">背景色</option>
            <option value="underline">下划线</option>
            <option value="both">背景 + 下划线</option>
          </select>
        </div>
        <div class="form-row"><label>不透明度</label>
          <input id="set-opacity" type="range" min="0.05" max="1" step="0.05" />
          <span id="opacity-val"></span>
        </div>
        <div class="form-row"><label>字号</label><input id="set-font-size" type="number" min="10" max="32" step="1" /></div>
        <div class="form-row"><label>字体</label>
          <input id="set-font-family" type="text" list="font-list" />
          <datalist id="font-list">
            <option value="'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif"></option>
            <option value="'Microsoft YaHei', sans-serif">微软雅黑</option>
            <option value="SimSun, serif">宋体</option>
            <option value="KaiTi, serif">楷体</option>
            <option value="Consolas, 'Courier New', monospace"></option>
            <option value="Georgia, serif"></option>
          </datalist>
        </div>
        <div class="form-row stops-row"><label>颜色节点<br/><span class="tip-dim">PPL ≤ 最小节点取端点色；≥ 最大节点取端点色；中间渐变</span></label>
          <div class="stops-editor" id="stops-editor"></div>
        </div>
        <div class="form-actions">
          <button id="stops-reset">恢复中文预设节点</button>
        </div>`

      const urlInp = body.querySelector('#set-url') as HTMLInputElement
      const styleSel = body.querySelector('#set-style') as HTMLSelectElement
      const opRange = body.querySelector('#set-opacity') as HTMLInputElement
      const opVal = body.querySelector('#opacity-val') as HTMLSpanElement
      const fsInp = body.querySelector('#set-font-size') as HTMLInputElement
      const ffInp = body.querySelector('#set-font-family') as HTMLInputElement
      const stopsEditor = body.querySelector('#stops-editor') as HTMLDivElement

      styleSel.value = settings.style
      opRange.value = String(settings.opacity)
      opVal.textContent = Math.round(settings.opacity * 100) + '%'
      fsInp.value = String(settings.fontSize)
      ffInp.value = settings.fontFamily

      urlInp.onchange = () => { settings.serverUrl = urlInp.value.trim() || settings.serverUrl; saveSettings(); handlers.onServerChanged() }
      styleSel.onchange = () => { settings.style = styleSel.value as typeof settings.style; saveSettings(); handlers.onSettingsChanged() }
      opRange.oninput = () => { settings.opacity = Number(opRange.value); opVal.textContent = Math.round(settings.opacity * 100) + '%'; saveSettings(); handlers.onSettingsChanged() }
      fsInp.onchange = () => { settings.fontSize = clamp(Number(fsInp.value) || 16, 10, 32); saveSettings(); handlers.onFontChanged() }
      ffInp.onchange = () => { settings.fontFamily = ffInp.value.trim() || settings.fontFamily; saveSettings(); handlers.onFontChanged() }

      const renderStops = (): void => {
        stopsEditor.innerHTML = settings.stops
          .map((s, i) => `
            <div class="stop-row" data-i="${i}">
              <span class="tip-dim">PPL ≤</span>
              <input type="number" class="stop-ppl" value="${s.ppl}" min="0" step="0.01" />
              <input type="color" class="stop-color" value="${s.color}" />
              <button class="stop-del danger" title="删除节点">✕</button>
            </div>`).join('') + '<button id="stop-add">+ 添加节点</button>'
        stopsEditor.querySelectorAll('.stop-row').forEach((row) => {
          const i = Number((row as HTMLElement).dataset.i)
          const pplInp = row.querySelector('.stop-ppl') as HTMLInputElement
          const colorInp = row.querySelector('.stop-color') as HTMLInputElement
          const delBtn = row.querySelector('.stop-del') as HTMLButtonElement
          pplInp.onchange = () => {
            settings.stops[i].ppl = Math.max(0, Number(pplInp.value) || 0)
            settings.stops.sort((a, b) => a.ppl - b.ppl)
            saveSettings(); handlers.onSettingsChanged(); renderStops()
          }
          colorInp.oninput = () => {
            settings.stops[i].color = colorInp.value
            saveSettings(); handlers.onSettingsChanged()
          }
          delBtn.onclick = () => {
            if (settings.stops.length <= 1) return toast('至少保留一个节点', 'warn')
            settings.stops.splice(i, 1)
            saveSettings(); handlers.onSettingsChanged(); renderStops()
          }
        })
        const addBtn = stopsEditor.querySelector('#stop-add') as HTMLButtonElement
        addBtn.onclick = () => {
          const last = settings.stops[settings.stops.length - 1]
          settings.stops.push({ ppl: (last ? last.ppl : 10) * 2, color: '#ef4444' })
          saveSettings(); handlers.onSettingsChanged(); renderStops()
        }
      }
      renderStops()
      const resetBtn = body.querySelector('#stops-reset') as HTMLButtonElement
      resetBtn.onclick = () => {
        settings.stops = [
          { ppl: 12, color: '#22c55e' }, { ppl: 18, color: '#eab308' },
          { ppl: 50, color: '#ef4444' }, { ppl: 100, color: '#7f1d1d' }
        ]
        saveSettings(); handlers.onSettingsChanged(); renderStops()
      }
    })
  }

  // ---------- 忽略清单弹窗 ----------
  els.ignoreList.onclick = () => {
    openModal('忽略清单', (body) => {
      const render = (): void => {
        const ranges = handlers.getIgnores()
        const docText = handlers.getDocText()
        body.innerHTML = ranges.length
          ? ranges.map((r, i) => {
              const preview = docText.slice(r.start, r.end).replace(/\n/g, '↵')
              const short = preview.length > 40 ? preview.slice(0, 40) + '…' : preview
              return `<div class="ignore-row" data-i="${i}">
                <span class="ignore-preview" title="${escapeHtml(preview)}">「${escapeHtml(short)}」</span>
                <span class="tip-dim">${r.end - r.start} 字符</span>
                <button class="danger" data-i="${i}">移除</button>
              </div>`
            }).join('') + '<div class="form-actions"><button id="ignore-clear" class="danger">清空全部</button></div>'
          : '<div class="tip-dim">清单为空。选中文字后点击「忽略选区」即可添加。</div>'
        body.querySelectorAll('.ignore-row button').forEach((btn) => {
          const b = btn as HTMLButtonElement
          b.onclick = () => {
            const i = Number(b.dataset.i)
            const ranges = handlers.getIgnores().slice()
            ranges.splice(i, 1)
            handlers.setIgnores(ranges)
            render()
          }
        })
        const clearBtn = body.querySelector('#ignore-clear')
        if (clearBtn) {
          const btn = clearBtn as HTMLButtonElement
          btn.onclick = () => { handlers.setIgnores([]); render() }
        }
      }
      render()
    })
  }

  // ---------- 工具栏事件 ----------
  els.analyze.onclick = () => handlers.onAnalyze(true)
  els.undo.onclick = () => handlers.onUndo()
  els.redo.onclick = () => handlers.onRedo()
  els.mode.value = settings.chunkMode
  els.mode.onchange = () => {
    settings.chunkMode = els.mode.value as typeof settings.chunkMode
    saveSettings()
    handlers.onSettingsChanged()
  }
  els.auto.checked = settings.autoRefresh
  els.auto.onchange = () => {
    settings.autoRefresh = els.auto.checked
    saveSettings()
    handlers.onAutoRefreshChanged(els.auto.checked)
  }
  els.ignore.onclick = () => handlers.onAddIgnore()
  els.stTokens.onclick = () => handlers.onAnalyze(true)

  // ---------- 分层窗口 ----------
  function winWidth(): number { return settings.windowWidth }

  function setWindow(n: number, m: number): void {
    settings.windowN = clamp(Math.round(n), 0, 100)
    settings.windowM = clamp(Math.round(m), 0, 100)
    if (settings.windowM < settings.windowN) [settings.windowN, settings.windowM] = [settings.windowM, settings.windowN]
    saveSettings()
    updateWindowLabel()
    handlers.onSettingsChanged()
  }

  els.winUp.onclick = () => {
    const w = winWidth()
    if (settings.windowN === 0 && settings.windowM === 100) setWindow(0, w)
    else setWindow(Math.min(100 - w, settings.windowN + w), Math.min(100, settings.windowM + w))
  }
  els.winDown.onclick = () => {
    const w = winWidth()
    if (settings.windowN === 0 && settings.windowM === 100) setWindow(100 - w, 100)
    else setWindow(Math.max(0, settings.windowN - w), Math.max(w, settings.windowM - w))
  }
  els.winTop.onclick = () => setWindow(100 - winWidth(), 100)
  els.winAll.onclick = () => setWindow(0, 100)

  els.winW.value = [5, 10, 20].includes(settings.windowWidth) ? String(settings.windowWidth) : 'custom'
  els.winW.onchange = () => {
    if (els.winW.value === 'custom') {
      els.winWInput.style.display = ''
      els.winWInput.value = String(settings.windowWidth)
      els.winWInput.focus()
    } else {
      els.winWInput.style.display = 'none'
      applyWidth(Number(els.winW.value))
    }
  }
  els.winWInput.onchange = () => applyWidth(clamp(Number(els.winWInput.value) || 10, 1, 100))
  if (els.winW.value === 'custom') { els.winWInput.style.display = ''; els.winWInput.value = String(settings.windowWidth) }

  function applyWidth(w: number): void {
    settings.windowWidth = w
    els.winWLabel.textContent = String(w)
    let m = settings.windowN + w
    let n = settings.windowN
    if (m > 100) { m = 100; n = Math.max(0, 100 - w) }
    setWindow(n, m)
  }
  els.winWLabel.textContent = String(winWidth())

  function updateWindowLabel(): void {
    els.windowLabel.textContent = `窗口 ${settings.windowN}%–${settings.windowM}%`
  }
  updateWindowLabel()

  // ---------- 直方图 ----------
  let histoData: { arr: number[]; x: HistoScale | null } = { arr: [], x: null }

  function renderHistogram(tokens: Token[]): void {
    const svg = els.histogram
    const W = svg.clientWidth || 800
    const H = svg.clientHeight || 80
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    svg.innerHTML = ''
    const arr = tokens
      .filter((t) => !t.stale && !t.ignored && t.ppl != null)
      .map((t) => Math.max(t.ppl!, 1e-6))
      .sort((a, b) => a - b)
    histoData.arr = arr
    const NS = 'http://www.w3.org/2000/svg'
    const mk = (tag: string, attrs: Record<string, string | number>): SVGElement => {
      const el = document.createElementNS(NS, tag)
      for (const k in attrs) el.setAttribute(k, String(attrs[k]))
      return el
    }
    if (!arr.length) {
      const t = mk('text', { x: W / 2, y: H / 2 + 4, 'text-anchor': 'middle', class: 'histo-empty' })
      t.textContent = '暂无已测量的 Token（点击「分析」）'
      svg.appendChild(t)
      histoData.x = null
      return
    }
    const padL = 6, padR = 6, padT = 4, padB = 14
    const lo = arr[0]
    let hi = arr[arr.length - 1]
    if (hi <= lo) hi = lo * 10
    const logLo = Math.log10(lo), logHi = Math.log10(hi)
    const x = (ppl: number): number =>
      padL + ((Math.log10(Math.max(ppl, 1e-6)) - logLo) / (logHi - logLo)) * (W - padL - padR)
    const invX = (px: number): number => Math.pow(10, logLo + ((px - padL) / (W - padL - padR)) * (logHi - logLo))
    histoData.x = { x, invX, lo, hi, W }

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
        x: padL + i * barW + 0.5, y: H - padB - bh, width: Math.max(1, barW - 1),
        height: bh, fill: colorForPpl(midPpl, settings.stops), 'fill-opacity': 0.85
      }))
    })

    // 分层窗口：窗口外压暗
    const pAt = (p: number): number => arr[clamp(Math.floor((p / 100) * arr.length), 0, arr.length - 1)]
    const x1 = x(pAt(settings.windowN))
    const x2 = settings.windowM >= 100 ? W - padR : x(pAt(settings.windowM))
    svg.appendChild(mk('rect', { x: padL, y: padT, width: Math.max(0, x1 - padL), height: H - padT - padB, fill: 'rgba(60,60,60,0.35)' }))
    svg.appendChild(mk('rect', { x: x2, y: padT, width: Math.max(0, W - padR - x2), height: H - padT - padB, fill: 'rgba(60,60,60,0.35)' }))

    // 轴标签
    const fmt = (v: number): string => (v >= 1000 ? v.toExponential(1) : Number(v.toFixed(1)).toString())
    const tLo = mk('text', { x: padL, y: H - 3, class: 'histo-axis' })
    tLo.textContent = `PPL ${fmt(lo)}`
    const tHi = mk('text', { x: W - padR, y: H - 3, 'text-anchor': 'end', class: 'histo-axis' })
    tHi.textContent = `${fmt(arr[arr.length - 1])} · 共 ${arr.length} 个`
    svg.appendChild(tLo)
    svg.appendChild(tHi)
  }

  // brush：拖拽框选 PPL 区间 → 换算为分位窗口
  let brush: { startX: number; rect: DOMRect; selEl: SVGRectElement | null } | null = null
  els.histogram.addEventListener('pointerdown', (e) => {
    if (settings.chunkMode !== 'token' || !histoData.x || !histoData.arr.length) return
    els.histogram.setPointerCapture(e.pointerId)
    const rect = els.histogram.getBoundingClientRect()
    brush = { startX: e.clientX - rect.left, rect, selEl: null }
  })
  els.histogram.addEventListener('pointermove', (e) => {
    if (!brush) return
    const px = e.clientX - brush.rect.left
    const x1 = clamp(Math.min(brush.startX, px), 0, brush.rect.width)
    const w = Math.abs(px - brush.startX)
    if (!brush.selEl) {
      brush.selEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect') as SVGRectElement
      brush.selEl.setAttribute('class', 'histo-brush')
      els.histogram.appendChild(brush.selEl)
    }
    brush.selEl.setAttribute('x', String(x1))
    brush.selEl.setAttribute('y', '0')
    brush.selEl.setAttribute('width', String(w))
    brush.selEl.setAttribute('height', String(els.histogram.clientHeight || 80))
  })
  els.histogram.addEventListener('pointerup', (e) => {
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

  // ---------- 状态栏 ----------
  function updateStatusBar(s: StatusBarStats): void {
    els.stChars.textContent = `字符 ${s.charCount}`
    els.stTokens.textContent = s.tokenCount != null ? `Token ${s.tokenCount}` : 'Token —'
    els.stElapsed.textContent = s.elapsedMs != null ? `耗时 ${Math.round(s.elapsedMs)} ms` : '耗时 —'
    if (s.health) {
      els.stBackend.textContent = `后端 ●在线 ${s.health.model || ''}`
      els.stBackend.title = `模型 ${s.health.model || '?'} · N_CTX ${s.health.n_ctx} · 字符上限 ${s.health.max_char_count} · 后端 ${s.health.nll_backend || '?'}`
      els.stBackend.classList.remove('offline')
    } else {
      els.stBackend.textContent = '后端 ○离线'
      els.stBackend.title = `无法连接 ${settings.serverUrl}/health`
      els.stBackend.classList.add('offline')
    }
    els.stNll.textContent = s.avgNll != null ? `平均 NLL ${s.avgNll.toFixed(3)}` : '平均 NLL —'
    if (s.avgPpl != null) {
      els.stPpl.textContent = `平均 PPL ${fmtNum(s.avgPpl)}`
      els.stPpl.style.color = colorForPpl(s.avgPpl, settings.stops)
      els.stPpl.style.fontWeight = '600'
    } else {
      els.stPpl.textContent = '平均 PPL —'
      els.stPpl.style.color = ''
      els.stPpl.style.fontWeight = ''
    }
    els.stCov.textContent = s.coverage != null ? `覆盖率 ${s.coverage.toFixed(0)}%` : '覆盖率 —'
    els.stPos.textContent = `行 ${s.line}, 列 ${s.col}`
  }

  // ---------- 对外 ----------
  function syncControls(): void {
    els.mode.value = settings.chunkMode
    els.auto.checked = settings.autoRefresh
    updateWindowLabel()
  }

  function setIgnoreCount(n: number): void {
    els.ignoreCount.textContent = String(n)
  }

  function setBusy(busy: boolean): void {
    els.analyze.disabled = busy
    els.analyze.textContent = busy ? '分析中…' : '分析'
  }

  window.addEventListener('resize', () => handlers.onResize())

  return {
    editorWrap: els.editorWrap,
    toast, openModal, closeModal,
    renderHistogram, updateStatusBar, syncControls, setIgnoreCount, setBusy,
    refreshPresetOptions
  }
}