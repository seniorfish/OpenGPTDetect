// ---------- Options page shell ----------
// Sidebar-navigated settings pages (hash router, no lib), one shared save /
// reset bar, i18n-reactive. Pages receive {settings, patch} and stay dumb.
import { useEffect, useState } from 'react'
import { parseProfileText, type PplScaleProfile } from '@opengptdetect/core'
import { Button } from '@opengptdetect/ui'
import {
  DEFAULT_SETTINGS,
  getProfileLib,
  getSettings,
  removeProfile,
  setSettingsPatch,
  upsertProfile,
  type ExtensionSettings,
} from '@/lib/settings.ts'
import { initLocale, t, useI18n } from '@/lib/i18n.ts'
import { GeneralPage } from './pages/general.tsx'
import { ExtractionPage } from './pages/extraction.tsx'
import { AdaptersPage } from './pages/adapters.tsx'
import { MeasurePage } from './pages/measure.tsx'
import { AiPage } from './pages/ai.tsx'
import { HeatmapPage } from './pages/heatmap.tsx'
import { SitesPage } from './pages/sites.tsx'
import { AboutPage } from './pages/about.tsx'
import { usePage, type PageId } from './use-page.ts'

const NAV: Array<{ id: PageId; labelKey: Parameters<typeof t>[0] }> = [
  { id: 'general', labelKey: 'options.nav.general' },
  { id: 'extraction', labelKey: 'options.nav.extraction' },
  { id: 'adapters', labelKey: 'options.nav.adapters' },
  { id: 'measure', labelKey: 'options.nav.measure' },
  { id: 'ai', labelKey: 'options.nav.ai' },
  { id: 'heatmap', labelKey: 'options.nav.heatmap' },
  { id: 'sites', labelKey: 'options.nav.sites' },
  { id: 'about', labelKey: 'options.nav.about' },
]

export default function App() {
  useI18n() // the shell re-renders when the interface language changes
  const [page, navigate] = usePage()
  const [settings, setSettings] = useState<ExtensionSettings>(() => ({ ...DEFAULT_SETTINGS }))
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [profileLib, setProfileLib] = useState<PplScaleProfile[]>([])

  useEffect(() => {
    void getSettings().then((s) => {
      setSettings(s)
      setLoaded(true)
      initLocale(s.locale)
    })
    void getProfileLib().then(setProfileLib)
  }, [])

  const patch = (p: Partial<ExtensionSettings>): void => setSettings((s) => ({ ...s, ...p }))

  function notify(text: string): void {
    setToast(text)
    setTimeout(() => setToast(''), 3000)
  }

  async function save(): Promise<void> {
    setSaving(true)
    try {
      const next = await setSettingsPatch(settings)
      setSettings(next)
      notify(t('options.saved'))
    } catch {
      notify(t('options.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function reset(): Promise<void> {
    const next = await setSettingsPatch({ ...DEFAULT_SETTINGS })
    setSettings(next)
    initLocale(next.locale)
    notify(t('options.resetted'))
  }

  async function onImportFile(file: File): Promise<void> {
    const result = parseProfileText(await file.text())
    if (result.ok) {
      setProfileLib(await upsertProfile(result.profile))
      notify(t('options.profile.imported', { name: result.profile.name }))
    } else {
      notify(t('options.profile.importFailed', { issues: result.issues.slice(0, 3).join('; ') }))
    }
  }

  return (
    <div className="flex h-screen font-sans text-sm text-foreground">
      {/* Sidebar */}
      <aside className="flex w-52 shrink-0 flex-col border-r bg-card">
        <header className="px-4 py-4">
          <h1 className="text-sm font-semibold leading-tight">{t('app.name')}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('options.title')}</p>
        </header>
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={
                'w-full rounded-md px-3 py-1.5 text-left text-xs transition-colors ' +
                (page === item.id
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground')
              }
            >
              {t(item.labelKey)}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-6">
          <div className="mb-5 flex items-center gap-3">
            <Button onClick={() => void save()} disabled={!loaded || saving} className="h-8">
              {t('options.save')}
            </Button>
            <Button
              variant="outline"
              className="h-8"
              onClick={() => void reset()}
              disabled={!loaded}
            >
              {t('options.reset')}
            </Button>
            {toast && <span className="text-xs text-green-600">{toast}</span>}
          </div>

          {page === 'general' && <GeneralPage settings={settings} patch={patch} />}
          {page === 'extraction' && <ExtractionPage settings={settings} patch={patch} />}
          {page === 'adapters' && <AdaptersPage settings={settings} patch={patch} />}
          {page === 'measure' && <MeasurePage settings={settings} patch={patch} />}
          {page === 'ai' && <AiPage settings={settings} patch={patch} />}
          {page === 'heatmap' && (
            <HeatmapPage
              settings={settings}
              patch={patch}
              profileLib={profileLib}
              onImportFile={onImportFile}
              onRemoveProfile={(id) => removeProfile(id).then(setProfileLib)}
            />
          )}
          {page === 'sites' && <SitesPage settings={settings} patch={patch} />}
          {page === 'about' && <AboutPage />}
        </div>
      </main>
    </div>
  )
}
