// ---------- Adapters page: one card per registered site adapter ----------
// Universal controls (enable / priority / url include+exclude) plus the
// adapter's own declared configFields, rendered generically. The default
// adapter cannot be disabled — it is the unconditional fallback.
import {
  ADAPTER_REGISTRY,
  DEFAULT_ADAPTER,
  DEFAULT_ADAPTER_PRIORITY,
  adapterRuntimeConfig,
  type AdapterConfigFieldValue,
} from '@/lib/adapters/index.ts'
import type { AdapterSettings } from '@/lib/settings.ts'
import { pickLabel, useI18n } from '@/lib/i18n.ts'
import { BoolRow, NumberRow, PageShell, TextAreaRow, type PageProps } from '../shared.tsx'
import { AdapterConfigFields } from '../adapter-config-fields.tsx'

export function AdaptersPage({ settings, patch }: PageProps) {
  const { t, locale } = useI18n()
  // patch is a SHALLOW merge: always spread the existing adapters record and
  // the existing per-adapter entry, or sibling adapters lose their settings.
  const setAdapter = (id: string, next: AdapterSettings): void =>
    patch({ adapters: { ...settings.adapters, [id]: next } })
  const setConfig = (id: string, key: string, value: AdapterConfigFieldValue): void => {
    const cur = settings.adapters[id] ?? {}
    setAdapter(id, { ...cur, config: { ...cur.config, [key]: value } })
  }
  return (
    <PageShell title={t('options.section.adapters')}>
      <div className="space-y-4">
        {ADAPTER_REGISTRY.map((adapter) => {
          const isDefault = adapter === DEFAULT_ADAPTER
          const st = settings.adapters[adapter.id] ?? {}
          return (
            <section
              key={adapter.id}
              className="space-y-3 rounded-lg border bg-card p-4 shadow-sm"
            >
              <h3 className="text-sm font-semibold">
                {adapter.title ? pickLabel(locale, adapter.title) : adapter.id}
              </h3>
              {isDefault ? (
                <p className="text-xs text-muted-foreground">{t('options.adapters.defaultLocked')}</p>
              ) : (
                <>
                  <div className="w-full">
                    <BoolRow
                      label={t('options.adapters.enabled')}
                      checked={st.enabled !== false}
                      onChange={(on) => setAdapter(adapter.id, { ...st, enabled: on })}
                    />
                  </div>
                  <NumberRow
                    label={t('options.adapters.priority')}
                    hint={t('options.adapters.priorityHint')}
                    value={st.priority ?? DEFAULT_ADAPTER_PRIORITY}
                    onChange={(n) => setAdapter(adapter.id, { ...st, priority: n })}
                  />
                  <TextAreaRow
                    label={t('options.adapters.urlInclude')}
                    value={st.urlInclude ?? []}
                    onChange={(v) => setAdapter(adapter.id, { ...st, urlInclude: v })}
                  />
                  <TextAreaRow
                    label={t('options.adapters.urlExclude')}
                    value={st.urlExclude ?? []}
                    onChange={(v) => setAdapter(adapter.id, { ...st, urlExclude: v })}
                  />
                </>
              )}
              <AdapterConfigFields
                fields={adapter.configFields ?? []}
                config={adapterRuntimeConfig(adapter, settings)}
                locale={locale}
                onChange={(key, value) => setConfig(adapter.id, key, value)}
              />
            </section>
          )
        })}
      </div>
    </PageShell>
  )
}
