import { Slider } from '@opengptdetect/ui'
import type { PplScaleProfile } from '@opengptdetect/core'
import { useI18n } from '@/lib/i18n.ts'
import { BoolRow, Field, PageShell, SelectRow, type PageProps } from '../shared.tsx'
import { ProfileSection } from '../profile-section.tsx'

export interface HeatmapPageProps extends PageProps {
  profileLib: PplScaleProfile[]
  onImportFile: (file: File) => Promise<void>
  onRemoveProfile: (id: string) => Promise<void>
}

export function HeatmapPage({
  settings,
  patch,
  profileLib,
  onImportFile,
  onRemoveProfile,
}: HeatmapPageProps) {
  const { t } = useI18n()
  return (
    <PageShell title={t('options.section.heatmap')}>
      <div className="space-y-6">
        <div className="space-y-4">
          <BoolRow
            label={t('options.field.heatmapEnabled')}
            checked={settings.heatmapEnabled}
            onChange={(on) => patch({ heatmapEnabled: on })}
          />
          <SelectRow
            label={t('options.field.heatmapStyle')}
            value={settings.heatmapStyle}
            options={[
              { value: 'background', label: t('options.value.heatmapStyle.background') },
              { value: 'underline', label: t('options.value.heatmapStyle.underline') },
              { value: 'bottombar', label: t('options.value.heatmapStyle.bottombar') },
            ]}
            onChange={(v) => patch({ heatmapStyle: v as 'background' | 'underline' | 'bottombar' })}
          />
          <Field label={t('options.field.heatmapOpacity')}>
            <div className="flex items-center gap-3">
              <Slider
                value={[settings.heatmapOpacity]}
                min={0.05}
                max={0.8}
                step={0.05}
                className="max-w-64"
                onValueChange={(v) =>
                  patch({ heatmapOpacity: Number(v[0] ?? settings.heatmapOpacity) })
                }
              />
              <span className="w-10 text-xs tabular-nums text-muted-foreground">
                {Math.round(settings.heatmapOpacity * 100)}%
              </span>
            </div>
          </Field>
        </div>

        <div className="border-t pt-4">
          <h3 className="mb-3 text-sm font-semibold">{t('options.section.profile')}</h3>
          <ProfileSection
            settings={settings}
            patch={patch}
            profileLib={profileLib}
            onImportFile={onImportFile}
            onRemoveProfile={onRemoveProfile}
          />
        </div>
      </div>
    </PageShell>
  )
}
