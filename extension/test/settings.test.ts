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
  setSettingsPatch,
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
    // Raw storage key is the driverKey ('settings'); the item key 'local:settings'
    // is only the wxt-storage address, NOT the underlying storage key.
    await browser.storage.local.set({ settings: { apiBaseUrl: 123, enabled: 'yes' } })
    expect((await getSettings()).apiBaseUrl).toBe('http://127.0.0.1:8000')
  })

  it('round-trips through the defineItem store', async () => {
    await settingsItem.setValue({ ...DEFAULT_SETTINGS, enabled: false, apiBaseUrl: 'http://x' })
    expect((await getSettings()).enabled).toBe(false)
    expect((await getSettings()).apiBaseUrl).toBe('http://x')
  })

  it('migrates a v1 store to v4 (scaleOverrides, locale, adapters added)', async () => {
    // A v1 store: no scaleOverrides/locale/adapters, scan params at the top level.
    const { scaleOverrides: _s, locale: _l, adapters: _a, ...v1 } = DEFAULT_SETTINGS
    await browser.storage.local.set({
      settings: { ...v1, textBlockMode: 'article', minParagraphChars: 20, maxBlocksPerPage: 2000 },
    })
    // Migrations run once at defineItem (module load, storage empty in tests);
    // seed first, then run the item's own migrate() explicitly.
    await settingsItem.migrate()
    const s = await getSettings()
    expect(s.scaleOverrides).toBeNull()
    expect(s.locale).toBe('auto')
    expect(s.adapters.default?.config).toMatchObject({
      textBlockMode: 'article',
      minParagraphChars: 20,
      maxBlocksPerPage: 2000,
    })
  })

  it('rejects invalid scaleOverrides on read', async () => {
    await settingsItem.setValue({
      ...DEFAULT_SETTINGS,
      scaleOverrides: [{ ppl: -5, color: 'not-a-color' }],
    })
    expect((await getSettings()).scaleOverrides).toBeNull()
  })
})

describe('adapter settings (v4)', () => {
  it('defaults carry an empty adapters record and no top-level scan keys', () => {
    expect(DEFAULT_SETTINGS.adapters).toEqual({})
    expect('textBlockMode' in DEFAULT_SETTINGS).toBe(false)
    expect('minParagraphChars' in DEFAULT_SETTINGS).toBe(false)
    expect('maxBlocksPerPage' in DEFAULT_SETTINGS).toBe(false)
  })

  it('migrates v3 scan params into the default adapter config', async () => {
    // A v3 store: current defaults minus adapters, scan params at the top level.
    const { adapters: _a, ...v3 } = DEFAULT_SETTINGS
    await browser.storage.local.set({
      settings: { ...v3, textBlockMode: 'all', minParagraphChars: 30, maxBlocksPerPage: 500 },
    })
    await settingsItem.migrate()
    const s = await getSettings()
    expect(s.adapters.default?.config).toMatchObject({
      textBlockMode: 'all',
      minParagraphChars: 30,
      maxBlocksPerPage: 500,
    })
    expect('textBlockMode' in s).toBe(false)
  })

  it('drops undefined scan params during migration instead of writing them', async () => {
    const { adapters: _a, ...v3 } = DEFAULT_SETTINGS
    await browser.storage.local.set({
      settings: {
        ...v3,
        textBlockMode: 'all',
        minParagraphChars: undefined,
        maxBlocksPerPage: 500,
      },
    })
    await settingsItem.migrate()
    const s = await getSettings()
    expect(s.adapters.default?.config).toEqual({ textBlockMode: 'all', maxBlocksPerPage: 500 })
  })

  it('round-trips a stored v4 adapters record untouched', async () => {
    const adapters = {
      zhihu: {
        enabled: false,
        priority: 10,
        urlExclude: ['a.com'],
        config: { includeComments: false },
      },
    }
    await settingsItem.setValue({ ...DEFAULT_SETTINGS, adapters })
    expect((await getSettings()).adapters).toEqual(adapters)
  })

  it('falls back to all defaults when the stored adapters record is corrupt', async () => {
    await browser.storage.local.set({ settings: { ...DEFAULT_SETTINGS, adapters: 'garbage' } })
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('tolerates unknown adapter ids and unknown config keys', async () => {
    await settingsItem.setValue({
      ...DEFAULT_SETTINGS,
      adapters: {
        ghost: { enabled: false, config: { whatever: 'x' } },
        default: { config: { minParagraphChars: 5 } },
      },
    })
    const s = await getSettings()
    expect(s.adapters.ghost?.enabled).toBe(false)
    expect(s.adapters.default?.config?.minParagraphChars).toBe(5)
  })

  it('setSettingsPatch keeps sibling adapter entries when the caller spreads them', async () => {
    await settingsItem.setValue({
      ...DEFAULT_SETTINGS,
      adapters: { default: { config: { minParagraphChars: 5 } } },
    })
    // setSettingsPatch is a SHALLOW merge: the caller (options page) must
    // spread the existing adapters record, exactly as the adapters page does.
    const cur = (await getSettings()).adapters
    await setSettingsPatch({ adapters: { ...cur, zhihu: { enabled: false } } })
    const s = await getSettings()
    expect(s.adapters.default?.config?.minParagraphChars).toBe(5)
    expect(s.adapters.zhihu?.enabled).toBe(false)
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
    // The legacy scan params land in the default adapter's config (v4 layout).
    expect(s.adapters.default?.config?.textBlockMode).toBe('all')
    const leftover = await browser.storage.local.get(null)
    expect('apiBaseUrl' in leftover).toBe(false)
    expect('textBlockMode' in leftover).toBe(false)
  })

  it('is a no-op when no legacy keys exist', async () => {
    await migrateLegacyStorage()
    expect((await getSettings()).apiBaseUrl).toBe('http://127.0.0.1:8000')
  })
})
