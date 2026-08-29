<script setup lang="ts">
// ---------- Settings modal ----------
import { computed } from 'vue'
import { useI18n } from '../../i18n.ts'
import { settings, saveSettings } from '../../composables/useSettings.ts'
import { useApp } from '../../composables/useApp.ts'
import { clamp } from '../../util.ts'
import ColorStopsEditor from '../ui/ColorStopsEditor.vue'

const { t } = useI18n()
const { settingsChanged, fontChanged, serverChanged } = useApp()

const opacityPct = computed(() => Math.round(settings.opacity * 100) + '%')

function onServerChange(event: Event): void {
  settings.serverUrl = (event.target as HTMLInputElement).value.trim() || settings.serverUrl
  saveSettings()
  serverChanged()
}

function onStyleChange(event: Event): void {
  settings.style = (event.target as HTMLSelectElement).value as typeof settings.style
  saveSettings()
  settingsChanged()
}

function onOpacityInput(event: Event): void {
  settings.opacity = Number((event.target as HTMLInputElement).value)
  saveSettings()
  settingsChanged()
}

function onFontSizeChange(event: Event): void {
  settings.fontSize = clamp(Number((event.target as HTMLInputElement).value) || 16, 10, 32)
  saveSettings()
  fontChanged()
}

function onFontFamilyChange(event: Event): void {
  settings.fontFamily = (event.target as HTMLInputElement).value.trim() || settings.fontFamily
  saveSettings()
  fontChanged()
}

function onStopChange(): void {
  saveSettings()
  settingsChanged()
}

function resetStops(): void {
  settings.stops = [
    { ppl: 12, color: '#22c55e' },
    { ppl: 18, color: '#eab308' },
    { ppl: 50, color: '#ef4444' },
    { ppl: 100, color: '#7f1d1d' }
  ]
  saveSettings()
  settingsChanged()
}
</script>

<template>
  <div class="form-row">
    <label>{{ t('modal.settings.backendUrl') }}</label>
    <input id="set-url" type="text" :value="settings.serverUrl" @change="onServerChange" />
  </div>
  <div class="form-row">
    <label>{{ t('modal.settings.style') }}</label>
    <select id="set-style" :value="settings.style" @change="onStyleChange">
      <option value="background">{{ t('modal.settings.styleBackground') }}</option>
      <option value="underline">{{ t('modal.settings.styleUnderline') }}</option>
      <option value="both">{{ t('modal.settings.styleBoth') }}</option>
    </select>
  </div>
  <div class="form-row">
    <label>{{ t('modal.settings.opacity') }}</label>
    <input
      id="set-opacity" type="range" min="0.05" max="1" step="0.05"
      :value="settings.opacity" @input="onOpacityInput"
    />
    <span id="opacity-val">{{ opacityPct }}</span>
  </div>
  <div class="form-row">
    <label>{{ t('modal.settings.fontSize') }}</label>
    <input id="set-font-size" type="number" min="10" max="32" step="1" :value="settings.fontSize" @change="onFontSizeChange" />
  </div>
  <div class="form-row">
    <label>{{ t('modal.settings.fontFamily') }}</label>
    <input
      id="set-font-family" type="text" list="font-list" :value="settings.fontFamily"
      @change="onFontFamilyChange"
    />
    <datalist id="font-list">
      <option value="'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif"></option>
      <option value="'Microsoft YaHei', sans-serif">微软雅黑</option>
      <option value="SimSun, serif">宋体</option>
      <option value="KaiTi, serif">楷体</option>
      <option value="Consolas, 'Courier New', monospace"></option>
      <option value="Georgia, serif"></option>
    </datalist>
  </div>
  <div class="form-row stops-row">
    <label>
      {{ t('modal.settings.stops') }}<br />
      <span class="tip-dim">{{ t('modal.settings.stopsHint') }}</span>
    </label>
    <ColorStopsEditor @change="onStopChange" />
  </div>
  <div class="form-actions">
    <button id="stops-reset" @click="resetStops">{{ t('modal.settings.resetStops') }}</button>
  </div>
</template>