import { useI18n } from '@/lib/i18n.ts'
import { PageShell } from '../shared.tsx'

export function AboutPage() {
  const { t } = useI18n()
  return (
    <PageShell title={t('options.section.about')}>
      <div className="space-y-2 text-sm">
        <h3 className="font-semibold">{t('app.name')}</h3>
        <p className="leading-6 text-muted-foreground">{t('options.about.body')}</p>
      </div>
    </PageShell>
  )
}
