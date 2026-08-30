import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, getSettings, setSettingsPatch, type ExtensionSettings } from '@/lib/settings.ts'

// Field rows for the basic settings form (S7 replaces the color/scale part with
// the shared ColorStopsEditor + profile library).
const TEXT_FIELDS = [
  'apiBaseUrl',
  'viewportRootMargin',
  'aiBorderColor'
] as const
const NUMBER_FIELDS = [
  'minParagraphChars',
  'mergeMaxGapChars',
  'maxBlocksPerPage',
  'englishCharRatioThreshold',
  'maxCharsPerRequest',
  'initialMeasureWords',
  'measureConcurrency',
  'annotateThresholdChars',
  'aiMinReliableTokens',
  'reliableMinChars',
  'heatmapOpacity',
  'smoothingWindowSize'
] as const
const BOOL_FIELDS = [
  'enabled',
  'shortcutEnabled',
  'mergeAdjacentShortParagraphs',
  'showPplLabel',
  'aiDetectEnabled',
  'aiTagEnabled',
  'aiBorderEnabled',
  'heatmapEnabled'
] as const
const ENUM_FIELDS = [
  ['textBlockMode', ['article', 'all']],
  ['loadingIndicator', ['icon', 'spinner', 'none']],
  ['heatmapStyle', ['background', 'underline', 'bottombar']],
  ['smoothingMode', ['token', 'sentence']],
  ['listMode', ['off', 'blacklist', 'whitelist']]
] as const

const LIST_FIELDS = ['whitelist', 'blacklist'] as const

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[180px_1fr] items-center gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export default function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(() => ({ ...DEFAULT_SETTINGS }))
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    void getSettings().then((s) => {
      setSettings(s)
      setLoaded(true)
    })
  }, [])

  const patch = (p: Partial<ExtensionSettings>): void => setSettings((s) => ({ ...s, ...p }))

  async function save(): Promise<void> {
    setSaving(true)
    try {
      await setSettingsPatch(settings)
      setToast('已保存')
    } catch {
      setToast('保存失败:数值无效')
    } finally {
      setSaving(false)
      setTimeout(() => setToast(''), 2000)
    }
  }

  async function reset(): Promise<void> {
    await setSettingsPatch({ ...DEFAULT_SETTINGS })
    setSettings({ ...DEFAULT_SETTINGS })
    setToast('已恢复默认')
    setTimeout(() => setToast(''), 2000)
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-lg font-semibold">PPL 热力图 · 设置</h1>

      <div className="mb-4 flex items-center gap-3">
        <button className="rounded-md border px-4 py-1.5 text-sm" onClick={() => void save()} disabled={!loaded || saving}>
          保存设置
        </button>
        <button className="rounded-md border px-4 py-1.5 text-sm text-red-600" onClick={() => void reset()} disabled={!loaded}>
          恢复默认
        </button>
        <span className="text-sm text-green-600">{toast}</span>
      </div>

      <div className="space-y-1">
        <h2 className="mb-2 text-sm font-semibold">通用</h2>
        {BOOL_FIELDS.slice(0, 2).map((k) => (
          <Field key={k} label={k}>
            <input
              type="checkbox"
              checked={settings[k]}
              onChange={(e) => patch({ [k]: e.target.checked } as Partial<ExtensionSettings>)}
            />
          </Field>
        ))}
        <Field label="API Base URL">
          <input
            className="rounded-md border px-2 py-1 text-sm"
            value={settings.apiBaseUrl}
            onChange={(e) => patch({ apiBaseUrl: e.target.value })}
          />
        </Field>

        <h2 className="mb-2 mt-4 text-sm font-semibold">文本块检测</h2>
        {ENUM_FIELDS.slice(0, 1).map(([k, opts]) => (
          <Field key={k} label={k}>
            <select className="rounded-md border px-2 py-1 text-sm" value={settings[k]} onChange={(e) => patch({ [k]: e.target.value } as Partial<ExtensionSettings>)}>
              {opts.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
        ))}
        <Field label="段落字数下限">
          <input
            className="rounded-md border px-2 py-1 text-sm"
            type="number"
            value={settings.minParagraphChars}
            onChange={(e) => patch({ minParagraphChars: Number(e.target.value) })}
          />
        </Field>
        <Field label="合并短段">
          <input type="checkbox" checked={settings.mergeAdjacentShortParagraphs} onChange={(e) => patch({ mergeAdjacentShortParagraphs: e.target.checked })} />
        </Field>
        <Field label="合并上限(字符)">
          <input className="rounded-md border px-2 py-1 text-sm" type="number" value={settings.mergeMaxGapChars} onChange={(e) => patch({ mergeMaxGapChars: Number(e.target.value) })} />
        </Field>
        <Field label="每页最大测量块数">
          <input className="rounded-md border px-2 py-1 text-sm" type="number" value={settings.maxBlocksPerPage} onChange={(e) => patch({ maxBlocksPerPage: Number(e.target.value) })} />
        </Field>

        <h2 className="mb-2 mt-4 text-sm font-semibold">测量策略</h2>
        <Field label="英文字符占比阈值">
          <input
            className="rounded-md border px-2 py-1 text-sm"
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={settings.englishCharRatioThreshold}
            onChange={(e) => patch({ englishCharRatioThreshold: Number(e.target.value) })}
          />
        </Field>
        <Field label="单次请求最大字符">
          <input className="rounded-md border px-2 py-1 text-sm" type="number" value={settings.maxCharsPerRequest} onChange={(e) => patch({ maxCharsPerRequest: Number(e.target.value) })} />
        </Field>
        <Field label="初始测量词数">
          <input className="rounded-md border px-2 py-1 text-sm" type="number" value={settings.initialMeasureWords} onChange={(e) => patch({ initialMeasureWords: Number(e.target.value) })} />
        </Field>
        <Field label="并发请求数">
          <input className="rounded-md border px-2 py-1 text-sm" type="number" min="1" max="8" value={settings.measureConcurrency} onChange={(e) => patch({ measureConcurrency: Number(e.target.value) })} />
        </Field>
        <Field label="视口预取半径">
          <input className="rounded-md border px-2 py-1 text-sm" value={settings.viewportRootMargin} onChange={(e) => patch({ viewportRootMargin: e.target.value })} />
        </Field>
        {ENUM_FIELDS.slice(1, 2).map(([k, opts]) => (
          <Field key={k} label={k}>
            <select className="rounded-md border px-2 py-1 text-sm" value={settings[k]} onChange={(e) => patch({ [k]: e.target.value } as Partial<ExtensionSettings>)}>
              {opts.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
        ))}

        <h2 className="mb-2 mt-4 text-sm font-semibold">标注与 AI 识别</h2>
        {BOOL_FIELDS.slice(2).map((k) => (
          <Field key={k} label={k}>
            <input type="checkbox" checked={settings[k]} onChange={(e) => patch({ [k]: e.target.checked } as Partial<ExtensionSettings>)} />
          </Field>
        ))}
        <Field label="标注小字阈值(字符)">
          <input className="rounded-md border px-2 py-1 text-sm" type="number" value={settings.annotateThresholdChars} onChange={(e) => patch({ annotateThresholdChars: Number(e.target.value) })} />
        </Field>
        <Field label="AI 可靠最小 token">
          <input className="rounded-md border px-2 py-1 text-sm" type="number" value={settings.aiMinReliableTokens} onChange={(e) => patch({ aiMinReliableTokens: Number(e.target.value) })} />
        </Field>
        <Field label="AI 可靠最小字符">
          <input className="rounded-md border px-2 py-1 text-sm" type="number" value={settings.reliableMinChars} onChange={(e) => patch({ reliableMinChars: Number(e.target.value) })} />
        </Field>
        <Field label="AI 边框颜色">
          <input type="color" value={settings.aiBorderColor} onChange={(e) => patch({ aiBorderColor: e.target.value })} />
        </Field>

        <h2 className="mb-2 mt-4 text-sm font-semibold">热力图</h2>
        {ENUM_FIELDS.slice(2).map(([k, opts]) => (
          <Field key={k} label={k}>
            <select className="rounded-md border px-2 py-1 text-sm" value={settings[k]} onChange={(e) => patch({ [k]: e.target.value } as Partial<ExtensionSettings>)}>
              {opts.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
        ))}
        <Field label="不透明度">
          <input
            className="accent-blue-600"
            type="range"
            min="0.05"
            max="0.8"
            step="0.05"
            value={settings.heatmapOpacity}
            onChange={(e) => patch({ heatmapOpacity: Number(e.target.value) })}
          />
        </Field>

        <h2 className="mb-2 mt-4 text-sm font-semibold">站点名单</h2>
        {LIST_FIELDS.map((k) => (
          <Field key={k} label={k}>
            <textarea
              className="min-h-16 rounded-md border px-2 py-1 text-sm"
              value={settings[k].join('\n')}
              onChange={(e) =>
                patch({
                  [k]: e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean)
                } as Partial<ExtensionSettings>)
              }
            />
          </Field>
        ))}
      </div>
    </div>
  )
}
