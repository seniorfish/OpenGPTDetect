import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getLocale,
  initLocale,
  resolveLocale,
  setLocale,
  subscribeLocale,
  t,
} from '../src/lib/i18n.ts'
import en from '../src/locales/en.json'
import zh from '../src/locales/zh.json'

function setNavigatorLanguages(langs: string[]): void {
  Object.defineProperty(navigator, 'languages', { value: langs, configurable: true })
}

beforeEach(() => setLocale('zh'))
afterEach(() => setLocale('zh'))

describe('i18n core', () => {
  it('the en resource covers every zh key (runtime check of the compile-time guard)', () => {
    for (const key of Object.keys(zh)) {
      expect(Object.keys(en)).toContain(key)
    }
  })

  it('t resolves the current message and interpolates params', () => {
    setLocale('zh')
    expect(t('popup.remeasure')).toBe('重新测量此页')
    setLocale('en')
    expect(t('popup.remeasure')).toBe('Remeasure this page')
    expect(t('popup.online', { model: 'qwen2' })).toBe('Local service online · qwen2')
  })

  it('locale store notifies subscribers on setLocale', () => {
    const seen: string[] = []
    const unsub = subscribeLocale(() => seen.push(getLocale()))
    setLocale('en')
    setLocale('en') // no duplicate notification for the same value
    unsub()
    expect(seen).toEqual(['en'])
  })
})

describe('locale resolution', () => {
  it('rejects nothing: explicit settings beat detection', () => {
    setNavigatorLanguages(['zh-CN'])
    expect(resolveLocale('zh')).toBe('zh')
    expect(resolveLocale('en')).toBe('en')
  })

  it('auto detects zh from Chinese browser languages', () => {
    setNavigatorLanguages(['zh-CN', 'en'])
    expect(resolveLocale('auto')).toBe('zh')
  })

  it('auto detects en from non-Chinese languages and falls back to zh', () => {
    setNavigatorLanguages(['en-US'])
    expect(resolveLocale('auto')).toBe('en')
    setNavigatorLanguages(['fr-FR'])
    expect(resolveLocale('auto')).toBe('zh')
  })

  it('initLocale applies the resolved locale', () => {
    setNavigatorLanguages(['de-DE'])
    expect(initLocale('auto')).toBe('zh')
  })
})
