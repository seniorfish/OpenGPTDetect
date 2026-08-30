import { useI18n } from '@/lib/i18n.ts'
import { BoolRow, Field, NumberRow, PageShell, type PageProps } from '../shared.tsx'

export function AiPage({ settings, patch }: PageProps) {
  const { t } = useI18n()
  return (
    <PageShell title={t('options.section.ai')}>
      <div className="space-y-4">
        <BoolRow
          label={t('options.field.aiDetectEnabled')}
          checked={settings.aiDetectEnabled}
          onChange={(on) => patch({ aiDetectEnabled: on })}
        />
        <NumberRow
          label={t('options.field.aiMinReliableTokens')}
          value={settings.aiMinReliableTokens}
          onChange={(v) => patch({ aiMinReliableTokens: v })}
        />
        <NumberRow
          label={t('options.field.reliableMinChars')}
          value={settings.reliableMinChars}
          onChange={(v) => patch({ reliableMinChars: v })}
        />
        <BoolRow
          label={t('options.field.aiTagEnabled')}
          checked={settings.aiTagEnabled}
          onChange={(on) => patch({ aiTagEnabled: on })}
        />
        <BoolRow
          label={t('options.field.aiBorderEnabled')}
          checked={settings.aiBorderEnabled}
          onChange={(on) => patch({ aiBorderEnabled: on })}
        />
        <Field label={t('options.field.aiBorderColor')}>
          <input
            type="color"
            className="h-8 w-16 cursor-pointer rounded-md border bg-background"
            value={settings.aiBorderColor}
            onChange={(e) => patch({ aiBorderColor: e.target.value })}
          />
        </Field>
      </div>
    </PageShell>
  )
}
