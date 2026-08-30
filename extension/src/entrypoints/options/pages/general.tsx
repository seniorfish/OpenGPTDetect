import { resolveLocale, setLocale, useI18n, type LocaleSetting } from '@/lib/i18n.ts'
import { BoolRow, PageShell, SelectRow, TextRow, type PageProps } from '../shared.tsx'

export function GeneralPage({ settings, patch }: PageProps) {
  const { t } = useI18n()
  return (
    <PageShell title={t('options.section.general')}>
      <div className="space-y-4">
        <SelectRow
          label={t('options.general.language')}
          value={settings.locale}
          options={[
            { value: 'auto', label: t('options.general.languageAuto') },
            { value: 'zh', label: t('options.general.languageZh') },
            { value: 'en', label: t('options.general.languageEn') },
          ]}
          onChange={(v) => {
            const locale = v as LocaleSetting
            patch({ locale })
            // Preview in place immediately; the explicit save persists it.
            setLocale(resolveLocale(locale))
          }}
        />
        <TextRow
          label={t('options.general.apiBaseUrl')}
          value={settings.apiBaseUrl}
          onChange={(v) => patch({ apiBaseUrl: v })}
          placeholder="http://127.0.0.1:8000"
        />
        <div className="space-y-2">
          <BoolRow
            label={t('options.general.enabled')}
            checked={settings.enabled}
            onChange={(on) => patch({ enabled: on })}
          />
          <BoolRow
            label={t('options.general.shortcutEnabled')}
            checked={settings.shortcutEnabled}
            onChange={(on) => patch({ shortcutEnabled: on })}
          />
        </div>
      </div>
    </PageShell>
  )
}
