import { useI18n } from '@/lib/i18n.ts'
import { BoolRow, NumberRow, PageShell, SelectRow, type PageProps } from '../shared.tsx'

export function ExtractionPage({ settings, patch }: PageProps) {
  const { t } = useI18n()
  return (
    <PageShell title={t('options.section.extraction')}>
      <div className="space-y-4">
        <SelectRow
          label={t('options.field.textBlockMode')}
          value={settings.textBlockMode}
          options={[
            { value: 'article', label: t('options.value.textBlockMode.article') },
            { value: 'all', label: t('options.value.textBlockMode.all') },
          ]}
          onChange={(v) => patch({ textBlockMode: v as 'article' | 'all' })}
        />
        <NumberRow
          label={t('options.field.minParagraphChars')}
          value={settings.minParagraphChars}
          onChange={(v) => patch({ minParagraphChars: v })}
        />
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
          label={t('options.field.maxBlocksPerPage')}
          value={settings.maxBlocksPerPage}
          min={1}
          onChange={(v) => patch({ maxBlocksPerPage: v })}
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
