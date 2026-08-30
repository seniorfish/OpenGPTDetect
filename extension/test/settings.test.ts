import { describe, it, expect, beforeEach } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { browser } from 'wxt/browser'
import { BUILTIN_PROFILES } from '@opengptdetect/core'
import {
  DEFAULT_SETTINGS,
  allProfiles,
  findProfile,
  getProfileLib,
  getSettings,
  migrateLegacyStorage,
  removeProfile,
  settingsItem,
  upsertProfile,
} from '../src/lib/settings.ts'

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

  it('migrates v1 settings to v2 (scaleOverrides added)', async () => {
    await browser.storage.local.set({
      'local:settings': { ...DEFAULT_SETTINGS, scaleOverrides: undefined },
    })
    const s = await getSettings()
    expect(s.scaleOverrides).toBeNull()
  })

  it('rejects invalid scaleOverrides on read', async () => {
    await settingsItem.setValue({
      ...DEFAULT_SETTINGS,
      scaleOverrides: [{ ppl: -5, color: 'not-a-color' }],
    })
    expect((await getSettings()).scaleOverrides).toBeNull()
  })
})

describe('profile library', () => {
  const custom = { ...BUILTIN_PROFILES[0]!, id: 'my-custom-2026', name: 'My custom' }

  it('upserts, lists and removes profiles', async () => {
    await upsertProfile(custom)
    const lib = await getProfileLib()
    expect(lib.some((p) => p.id === 'my-custom-2026')).toBe(true)
    await removeProfile('my-custom-2026')
    expect((await getProfileLib()).length).toBe(0)
  })

  it('allProfiles merges built-ins with the user library without shadowing', async () => {
    const lib = await upsertProfile(custom)
    const all = allProfiles(lib)
    expect(all.some((p) => p.id === 'zh-default-2026')).toBe(true)
    expect(all.some((p) => p.id === 'my-custom-2026')).toBe(true)
    // A built-in id cannot be replaced by the user library.
    const libWithShadow = await upsertProfile({ ...custom, id: 'zh-default-2026' })
    expect(findProfile('zh-default-2026', libWithShadow)?.name).toBe('中文默认')
  })
})

describe('legacy storage migration', () => {
  it('absorbs legacy flat keys and removes them', async () => {
    await browser.storage.local.set({
      apiBaseUrl: 'http://legacy',
      textBlockMode: 'all',
      enabled: false,
    })
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
