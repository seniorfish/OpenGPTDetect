// Proxy for the local model service (page CORS/CSP bypass), the toggle shortcut
// and one-shot legacy-storage migration. Payloads go through core's Transport +
// Zod schemas, so the service responses are validated exactly like the editor's.
import { createApi, createFetchTransport } from '@opengptdetect/core'
import { getSettings, setSettingsPatch, migrateLegacyStorage } from '../lib/settings.ts'
import { on } from '../lib/messaging.ts'

export default defineBackground(() => {
  on('ppl', async ({ baseUrl, text }) => {
    const api = createApi(createFetchTransport(), () => baseUrl)
    try {
      const data = await api.ppl(text)
      return { ok: true, data } as const
    } catch (e) {
      const status = (e as { status?: number }).status ?? 0
      return { ok: false, status, error: e instanceof Error ? e.message : String(e) } as const
    }
  })

  on('health', async ({ baseUrl }) => {
    const api = createApi(createFetchTransport(), () => baseUrl)
    try {
      const data = await api.health()
      if (!data) return { ok: false, status: 0, error: 'offline' } as const
      return { ok: true, data } as const
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) } as const
    }
  })

  // Shortcut: toggle enable, then notify the active tab (content reacts in place).
  browser.commands.onCommand.addListener(async (cmd) => {
    if (cmd !== 'toggle-enabled') return
    const s = await getSettings()
    if (!s.shortcutEnabled) return
    const enabled = !s.enabled
    await setSettingsPatch({ enabled })
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      browser.tabs.sendMessage(tab.id, { type: 'enabled-toggled', enabled }).catch(() => {})
    }
  })

  browser.runtime.onInstalled.addListener(() => {
    void migrateLegacyStorage()
  })
})
