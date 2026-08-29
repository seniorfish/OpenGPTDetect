<script setup lang="ts">
// ---------- Toolbar ----------
import { computed } from 'vue'
import { useI18n } from '../i18n.ts'
import { settings, saveSettings, applyPreset } from '../composables/useSettings.ts'
import { useApp } from '../composables/useApp.ts'
import { usePresetTable } from '../composables/usePresets.ts'
import { toast } from '../composables/useToasts.ts'

const { t, locale } = useI18n()
const app = useApp()
const { state, settingsChanged, autoRefreshChanged } = app
const presets = usePresetTable()

const analyzeLabel = computed(() => (state.inFlight ? t('toolbar.analyzeBusy') : t('toolbar.analyze')))

function onAnalyze(): void {
  void app.analyze(true)
}

function onChunkModeChange(event: Event): void {
  settings.chunkMode = (event.target as HTMLSelectElement).value as typeof settings.chunkMode
  saveSettings()
  settingsChanged()
}

function onAutoRefreshChange(event: Event): void {
  settings.autoRefresh = (event.target as HTMLInputElement).checked
  saveSettings()
  autoRefreshChanged(settings.autoRefresh)
}

function onPresetChange(event: Event): void {
  const name = (event.target as HTMLSelectElement).value
  if (!name) return
  applyPreset(presets[name])
  settingsChanged()
  toast(t('toast.loadedPreset', { name }))
}

function onLangChange(event: Event): void {
  locale.value = (event.target as HTMLSelectElement).value as 'zh' | 'en'
}
</script>

<template>
  <div class="toolbar">
    <button
      id="btn-analyze" class="primary" :title="t('toolbar.analyzeHint')"
      :disabled="state.inFlight" @click="onAnalyze"
    >
      {{ analyzeLabel }}
    </button>
    <label class="chk" :title="t('toolbar.autoRefreshHint')">
      <input
        type="checkbox" id="chk-auto" :checked="settings.autoRefresh"
        @change="onAutoRefreshChange"
      />
      {{ t('toolbar.autoRefresh') }}
    </label>
    <span class="sep"></span>
    <button id="btn-undo" :title="t('toolbar.undoHint')" @click="app.undo()">↶ {{ t('toolbar.undo') }}</button>
    <button id="btn-redo" :title="t('toolbar.redoHint')" @click="app.redo()">↷ {{ t('toolbar.redo') }}</button>
    <span class="sep"></span>
    <label class="lbl" :title="t('toolbar.chunkModeHint')">
      {{ t('toolbar.chunkMode') }}
      <select id="sel-mode" :value="settings.chunkMode" @change="onChunkModeChange">
        <option value="token">{{ t('toolbar.chunkToken') }}</option>
        <option value="sentence">{{ t('toolbar.chunkSentence') }}</option>
        <option value="paragraph">{{ t('toolbar.chunkParagraph') }}</option>
      </select>
    </label>
    <span class="sep"></span>
    <button id="btn-ignore" :title="t('toolbar.ignoreHint')" @click="app.addIgnoreFromSelection()">
      {{ t('toolbar.ignore') }}
    </button>
    <button id="btn-ignore-list" :title="t('toolbar.ignoreListHint')" @click="app.openModal('ignoreList')">
      {{ t('toolbar.ignoreList') }} <span id="ignore-count">{{ state.ignoreCount }}</span>
    </button>
    <span class="sep"></span>
    <label class="lbl" :title="t('toolbar.presetHint')">
      {{ t('toolbar.preset') }}
      <select id="sel-preset" @change="onPresetChange">
        <option value="">{{ t('toolbar.presetPlaceholder') }}</option>
        <option v-for="name in Object.keys(presets)" :key="name" :value="name">{{ name }}</option>
      </select>
    </label>
    <button id="btn-save-preset" :title="t('toolbar.savePresetHint')" @click="app.openModal('savePreset')">
      {{ t('toolbar.savePreset') }}
    </button>
    <button id="btn-manage-preset" :title="t('toolbar.managePresetsHint')" @click="app.openModal('managePresets')">
      {{ t('toolbar.managePresets') }}
    </button>
    <span class="sep"></span>
    <button id="btn-settings" :title="t('toolbar.settingsHint')" @click="app.openModal('settings')">
      {{ t('toolbar.settings') }}
    </button>
    <label class="lbl" :title="t('toolbar.langHint')">
      <select id="sel-lang" :value="locale" @change="onLangChange">
        <option value="zh">中文</option>
        <option value="en">English</option>
      </select>
    </label>
  </div>
</template>