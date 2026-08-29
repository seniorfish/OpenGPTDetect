<script setup lang="ts">
// ---------- Status bar ----------
import { computed } from 'vue'
import { useI18n } from '../i18n.ts'
import { useApp } from '../composables/useApp.ts'
import { settings } from '../composables/useSettings.ts'
import { colorForPpl, fmtNum } from '../util.ts'

const { t } = useI18n()
const { state, analyze } = useApp()

const charsLabel = computed(() => t('statusbar.chars', { n: state.charCount }))

const tokensLabel = computed(() =>
  state.tokenCount != null ? t('statusbar.tokens', { count: state.tokenCount }) : t('statusbar.tokensNone')
)

const elapsedLabel = computed(() =>
  state.elapsedMs != null ? t('statusbar.elapsed', { ms: Math.round(state.elapsedMs) }) : t('statusbar.elapsedNone')
)

const backendLabel = computed(() =>
  state.health ? t('statusbar.backendOnline', { model: state.health.model || '' }) : t('statusbar.backendOffline')
)

const backendHint = computed(() =>
  state.health
    ? t('statusbar.backendOnlineHint', {
        model: state.health.model || '?',
        n_ctx: state.health.n_ctx,
        max: state.health.max_char_count,
        backend: state.health.nll_backend || '?'
      })
    : t('statusbar.backendOfflineHint', { url: settings.serverUrl })
)

const nllLabel = computed(() =>
  state.avgNll != null ? t('statusbar.nll', { n: state.avgNll.toFixed(3) }) : t('statusbar.nllNone')
)

const pplLabel = computed(() =>
  state.avgPpl != null ? t('statusbar.ppl', { n: fmtNum(state.avgPpl) }) : t('statusbar.pplNone')
)

// Re-computes when the palette (settings.stops) or the value changes.
const pplStyle = computed(() =>
  state.avgPpl != null
    ? { color: colorForPpl(state.avgPpl, settings.stops), fontWeight: '600' }
    : {}
)

const covLabel = computed(() =>
  state.coverage != null ? t('statusbar.coverage', { p: state.coverage.toFixed(0) }) : t('statusbar.coverageNone')
)

const posLabel = computed(() =>
  t('statusbar.pos', { line: state.cursorLine, col: state.cursorCol })
)
</script>

<template>
  <div class="statusbar" id="statusbar">
    <span class="st" id="st-chars" :title="t('statusbar.charsHint')">{{ charsLabel }}</span>
    <span class="st clickable" id="st-tokens" :title="t('statusbar.tokensHint')" @click="analyze(true)">
      {{ tokensLabel }}
    </span>
    <span class="st" id="st-elapsed" :title="t('statusbar.elapsedHint')">{{ elapsedLabel }}</span>
    <span class="st" id="st-backend" :class="{ offline: !state.health }" :title="backendHint">{{ backendLabel }}</span>
    <span class="st" id="st-nll" :title="t('statusbar.nllHint')">{{ nllLabel }}</span>
    <span class="st" id="st-ppl" :title="t('statusbar.pplHint')" :style="pplStyle">{{ pplLabel }}</span>
    <span class="st" id="st-cov" :title="t('statusbar.coverageHint')">{{ covLabel }}</span>
    <span class="st" id="st-pos" :title="t('statusbar.posHint')">{{ posLabel }}</span>
  </div>
</template>