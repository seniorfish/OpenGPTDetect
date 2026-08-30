// ---------- Colors & profiles section (heat map page) ----------
// Detected-class -> profile binding, user color-stack override via the shared
// ColorStopsEditor, profile import/export and the user profile library.
// The app shell owns storage I/O; this section is purely presentational.
import { useRef, useState } from 'react'
import { BUILTIN_PROFILES, type ColorStop, type PplScaleProfile } from '@opengptdetect/core'
import {
  Button,
  ColorStopsEditor,
  ProfileDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  downloadJson,
} from '@opengptdetect/ui'
import { useI18n } from '@/lib/i18n.ts'
import { allProfiles, findProfile } from '@/lib/settings.ts'
import { Field, type PageProps } from './shared.tsx'

export interface ProfileSectionProps extends PageProps {
  profileLib: PplScaleProfile[]
  onImportFile: (file: File) => Promise<void>
  onRemoveProfile: (id: string) => Promise<void>
}

export function ProfileSection({
  settings,
  patch,
  profileLib,
  onImportFile,
  onRemoveProfile,
}: ProfileSectionProps) {
  const { t } = useI18n()
  const [exportOpen, setExportOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const activeStops: ColorStop[] =
    settings.scaleOverrides ??
    findProfile(settings.profiles.zh, profileLib)?.scale.stops ??
    BUILTIN_PROFILES[0]!.scale.stops

  const binding = (lang: 'zh' | 'en') => (
    <Field label={lang === 'zh' ? t('options.profile.zhBinding') : t('options.profile.enBinding')}>
      <Select
        value={settings.profiles[lang]}
        onValueChange={(v) => patch({ profiles: { ...settings.profiles, [lang]: v } })}
      >
        <SelectTrigger className="w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allProfiles(profileLib).map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name} ({p.id})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )

  return (
    <div className="space-y-4">
      {binding('zh')}
      {binding('en')}

      <Field label={t('options.profile.customStops')}>
        <div className="space-y-2">
          <ColorStopsEditor
            value={activeStops}
            onChange={(stops) => patch({ scaleOverrides: stops })}
            strings={{
              pplLabel: t('options.profile.stopPpl'),
              deleteHint: t('options.profile.stopDeleteHint'),
              addLabel: t('options.profile.stopAdd'),
              minStopsToast: t('toast.minStops'),
            }}
          />
          {settings.scaleOverrides && (
            <Button
              variant="link"
              size="sm"
              className="h-6 px-0"
              onClick={() => patch({ scaleOverrides: null })}
            >
              {t('options.profile.followBinding')}
            </Button>
          )}
        </div>
      </Field>

      <Field label={t('options.profile.importExport')}>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            {t('options.profile.import')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            {t('options.profile.export')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = '' // allow re-selecting the same file
              if (file) void onImportFile(file)
            }}
          />
        </div>
      </Field>

      {profileLib.length > 0 && (
        <Field label={t('options.profile.library')}>
          <ul className="space-y-1">
            {profileLib.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-xs">
                <span className="truncate">
                  {p.name}（{p.id}）
                </span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-5 px-0 text-destructive"
                  onClick={() => void onRemoveProfile(p.id)}
                >
                  {t('options.profile.delete')}
                </Button>
              </li>
            ))}
          </ul>
        </Field>
      )}

      <ProfileDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        stops={activeStops}
        onExport={(profile) => downloadJson(`${profile.id}.ppl-scale.json`, profile)}
        strings={{
          title: t('options.profile.export'),
          hint: t('options.profile.dialogHint'),
          nameLabel: t('options.profile.dialogName'),
          idLabel: t('options.profile.dialogId'),
          scopeLabel: t('options.profile.dialogScope'),
          guidelineLabel: t('options.profile.dialogGuideline'),
          aiLikeLabel: t('options.profile.dialogAiLike'),
          humanLikeLabel: t('options.profile.dialogHumanLike'),
          hardPplLabel: t('options.profile.dialogHard'),
          cancelLabel: t('options.profile.dialogCancel'),
          exportLabel: t('options.profile.export'),
          invalidHint: t('options.profile.dialogInvalid'),
        }}
      />
    </div>
  )
}
