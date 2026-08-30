import { useI18n } from '@/lib/i18n.ts'
import { PageShell, SelectRow, TextAreaRow, type PageProps } from '../shared.tsx'

export function SitesPage({ settings, patch }: PageProps) {
  const { t } = useI18n()
  return (
    <PageShell title={t('options.section.sites')}>
      <div className="space-y-4">
        <SelectRow
          label={t('options.field.listMode')}
          value={settings.listMode}
          options={[
            { value: 'off', label: t('options.value.listMode.off') },
            { value: 'blacklist', label: t('options.value.listMode.blacklist') },
            { value: 'whitelist', label: t('options.value.listMode.whitelist') },
          ]}
          onChange={(v) => patch({ listMode: v as 'off' | 'blacklist' | 'whitelist' })}
        />
        <TextAreaRow
          label={t('options.field.whitelist')}
          value={settings.whitelist}
          onChange={(v) => patch({ whitelist: v })}
        />
        <TextAreaRow
          label={t('options.field.blacklist')}
          value={settings.blacklist}
          onChange={(v) => patch({ blacklist: v })}
        />
      </div>
    </PageShell>
  )
}
