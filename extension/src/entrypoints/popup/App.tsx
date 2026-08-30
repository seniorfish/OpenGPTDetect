import { useEffect, useState } from 'react'
import { getSettings, setSettingsPatch } from '@/lib/settings.ts'
import { send } from '@/lib/messaging.ts'

type HealthState =
  | { status: 'checking' }
  | { status: 'online'; model: string }
  | { status: 'offline'; detail: string }

export default function App() {
  const [enabled, setEnabled] = useState(true)
  const [health, setHealth] = useState<HealthState>({ status: 'checking' })

  useEffect(() => {
    let alive = true
    void (async () => {
      const s = await getSettings()
      if (!alive) return
      setEnabled(s.enabled)
      const r = await send('health', { baseUrl: s.apiBaseUrl })
      if (!alive) return
      setHealth(
        r.ok && r.data
          ? { status: 'online', model: r.data.model }
          : { status: 'offline', detail: r.ok ? 'offline' : String((r as { status?: number }).status ?? '') }
      )
    })()
    return () => {
      alive = false
    }
  }, [])

  async function toggle(on: boolean): Promise<void> {
    await setSettingsPatch({ enabled: on })
    setEnabled(on)
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      browser.tabs.sendMessage(tab.id, { type: 'enabled-toggled', enabled: on }).catch(() => {})
    }
  }

  async function remeasure(): Promise<void> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    try {
      await browser.tabs.sendMessage(tab.id, { type: 'remeasure' })
    } catch {
      if (tab.id != null) await browser.tabs.reload(tab.id)
    }
  }

  return (
    <div className="w-64 p-4 text-sm">
      <header className="mb-3 flex items-center gap-2">
        <h1 className="font-semibold">PPL 热力图</h1>
        <span
          className={
            'ml-auto size-2 rounded-full ' +
            (health.status === 'online'
              ? 'bg-green-500'
              : health.status === 'offline'
                ? 'bg-red-500'
                : 'bg-amber-400')
          }
        />
      </header>

      <div className="mb-3 text-xs text-muted-foreground">
        {health.status === 'checking' && '检测服务中…'}
        {health.status === 'online' && `本地服务在线 · ${health.model}`}
        {health.status === 'offline' && `服务离线(${health.detail})`}
      </div>

      <label className="mb-3 flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <span>启用扩展(当前页)</span>
      </label>

      <div className="flex gap-2">
        <button
          className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
          onClick={() => void remeasure()}
        >
          重新测量此页
        </button>
        <button
          className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
          onClick={() => browser.runtime.openOptionsPage()}
        >
          打开设置
        </button>
      </div>
    </div>
  )
}
