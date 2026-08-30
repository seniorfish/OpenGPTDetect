import { useI18n } from '@/lib/i18n.ts'
import { NumberRow, PageShell, SelectRow, TextRow, type PageProps } from '../shared.tsx'

export function MeasurePage({ settings, patch }: PageProps) {
  const { t } = useI18n()
  return (
    <PageShell title={t('options.section.measure')}>
      <div className="space-y-4">
        <NumberRow
          label={t('options.field.englishCharRatioThreshold')}
          value={settings.englishCharRatioThreshold}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => patch({ englishCharRatioThreshold: v })}
        />
        <NumberRow
          label={t('options.field.maxCharsPerRequest')}
          value={settings.maxCharsPerRequest}
          min={1}
          onChange={(v) => patch({ maxCharsPerRequest: v })}
        />
        <NumberRow
          label={t('options.field.initialMeasureWords')}
          value={settings.initialMeasureWords}
          onChange={(v) => patch({ initialMeasureWords: v })}
        />
        <NumberRow
          label={t('options.field.measureConcurrency')}
          value={settings.measureConcurrency}
          min={1}
          max={8}
          onChange={(v) => patch({ measureConcurrency: Math.min(8, Math.max(1, Math.round(v))) })}
        />
        <TextRow
          label={t('options.field.viewportRootMargin')}
          value={settings.viewportRootMargin}
          onChange={(v) => patch({ viewportRootMargin: v })}
          placeholder="600px"
        />
        <SelectRow
          label={t('options.field.loadingIndicator')}
          value={settings.loadingIndicator}
          options={[
            { value: 'icon', label: t('options.value.loadingIndicator.icon') },
            { value: 'spinner', label: t('options.value.loadingIndicator.spinner') },
            { value: 'none', label: t('options.value.loadingIndicator.none') },
          ]}
          onChange={(v) => patch({ loadingIndicator: v as 'icon' | 'spinner' | 'none' })}
        />
        <SelectRow
          label={t('options.field.smoothingMode')}
          value={settings.smoothingMode}
          options={[
            { value: 'token', label: t('options.value.smoothingMode.token') },
            { value: 'sentence', label: t('options.value.smoothingMode.sentence') },
          ]}
          onChange={(v) => patch({ smoothingMode: v as 'token' | 'sentence' })}
        />
        <NumberRow
          label={t('options.field.smoothingWindowSize')}
          value={settings.smoothingWindowSize}
          min={1}
          max={9}
          onChange={(v) => patch({ smoothingWindowSize: v })}
        />
      </div>
    </PageShell>
  )
}
