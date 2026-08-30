import { useEffect, useState } from 'react'
import { getSettings, setSettingsPatch } from '@/lib/settings.ts'
import { send } from '@/lib/messaging.ts'
import { initLocale, t, useLocale } from '@/lib/i18n.ts'
import { Button, Switch } from '@opengptdetect/ui'

type HealthState =
  | { status: 'checking' }
  | { status: 'online'; model: string }
  | { status: 'offline'; detail: string }

export default function App() {
  const [enabled, setEnabled] = useState(true)
  const [health, setHealth] = useState<HealthState>({ status: 'checking' })
  void useLocale() // re-render when the locale changes while the popup stays open

  useEffect(() => {
    let alive = true
    void (async () => {
      const s = await getSettings()
      if (!alive) return
      setEnabled(s.enabled)
      initLocale(s.locale)
      const r = await send('health', { baseUrl: s.apiBaseUrl })
      if (!alive) return
      setHealth(
        r.ok && r.data
          ? { status: 'online', model: r.data.model }
          : {
              status: 'offline',
              detail: r.ok ? 'offline' : String((r as { status?: number }).status ?? ''),
            },
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
    <div className="w-72 p-4 font-sans text-sm text-foreground">
      <header className="mb-3 flex items-center gap-2">
        <h1 className="font-semibold">{t('app.name')}</h1>
        <span
          className={
            'ml-auto size-2 rounded-full ' +
            (health.status === 'online'
              ? 'bg-green-500'
              : health.status === 'offline'
                ? 'bg-red-500'
                : 'bg-amber-400')
          }
          aria-hidden
        />
      </header>

      <div className="mb-3 min-h-4 text-xs text-muted-foreground">
        {health.status === 'checking' && t('popup.checking')}
        {health.status === 'online' && t('popup.online', { model: health.model })}
        {health.status === 'offline' && t('popup.offline', { detail: health.detail })}
      </div>

      <div className="mb-3 flex items-center justify-between rounded-md border px-3 py-2">
        <span>{t('popup.enable')}</span>
        <Switch checked={enabled} onCheckedChange={(on) => void toggle(on)} />
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => void remeasure()}>
          {t('popup.remeasure')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="flex-1"
          onClick={() => browser.runtime.openOptionsPage()}
        >
          {t('popup.openOptions')}
        </Button>
      </div>
    </div>
  )
}
