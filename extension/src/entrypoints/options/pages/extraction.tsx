import { useI18n } from '@/lib/i18n.ts'
import { BoolRow, NumberRow, PageShell, type PageProps } from '../shared.tsx'

export function ExtractionPage({ settings, patch }: PageProps) {
  const { t } = useI18n()
  return (
    <PageShell title={t('options.section.extraction')}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {t('options.extraction.adapterHint')}{' '}
          <a className="underline" href="#/adapters">
            {t('options.nav.adapters')}
          </a>
        </p>
        <div className="w-full">
          <BoolRow
            label={t('options.field.mergeAdjacentShortParagraphs')}
            checked={settings.mergeAdjacentShortParagraphs}
            onChange={(on) => patch({ mergeAdjacentShortParagraphs: on })}
          />
        </div>
        <NumberRow
          label={t('options.field.mergeMaxGapChars')}
          value={settings.mergeMaxGapChars}
          onChange={(v) => patch({ mergeMaxGapChars: v })}
        />
        <NumberRow
          label={t('options.field.annotateThresholdChars')}
          value={settings.annotateThresholdChars}
          onChange={(v) => patch({ annotateThresholdChars: v })}
        />
      </div>
    </PageShell>
  )
}
