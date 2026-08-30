import { describe, it, expect, beforeEach } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { browser } from 'wxt/browser'
import { DEFAULT_SETTINGS, getSettings, migrateLegacyStorage, settingsItem } from '../src/lib/settings.ts'

beforeEach(async () => {
  fakeBrowser.reset()
  await browser.storage.local.clear()
})

describe('settings persistence', () => {
  it('returns defaults when nothing stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('re-validates and falls back on corrupt values', async () => {
    await browser.storage.local.set({ 'local:settings': { apiBaseUrl: 123, enabled: 'yes' } })
    expect((await getSettings()).apiBaseUrl).toBe('http://127.0.0.1:8000')
  })

  it('round-trips through the defineItem store', async () => {
    await settingsItem.setValue({ ...DEFAULT_SETTINGS, enabled: false, apiBaseUrl: 'http://x' })
    expect((await getSettings()).enabled).toBe(false)
    expect((await getSettings()).apiBaseUrl).toBe('http://x')
  })
})

describe('legacy storage migration', () => {
  it('absorbs legacy flat keys and removes them', async () => {
    await browser.storage.local.set({ apiBaseUrl: 'http://legacy', textBlockMode: 'all', enabled: false })
    await migrateLegacyStorage()
    const s = await getSettings()
    expect(s.apiBaseUrl).toBe('http://legacy')
    expect(s.textBlockMode).toBe('all')
    const leftover = await browser.storage.local.get(null)
    expect('apiBaseUrl' in leftover).toBe(false)
    expect('textBlockMode' in leftover).toBe(false)
  })

  it('is a no-op when no legacy keys exist', async () => {
    await migrateLegacyStorage()
    expect((await getSettings()).apiBaseUrl).toBe('http://127.0.0.1:8000')
  })
})
