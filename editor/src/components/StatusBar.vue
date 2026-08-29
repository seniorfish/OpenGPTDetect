<script setup lang="ts">
// ---------- Status bar ----------
// A slim bottom strip: backend health badge, document statistics (avg PPL colored
// by the active palette), and cursor position. Every statistic reuses the app's
// reactive state and the existing i18n keys.
import { computed } from 'vue'
import { useI18n } from '../i18n.ts'
import { useApp } from '../composables/useApp.ts'
import { settings } from '../composables/useSettings.ts'
import { colorForPpl, fmtNum } from '../util.ts'
import { Separator } from '../components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent } from '../components/ui/tooltip'

const { t } = useI18n()
const { state, analyze } = useApp()

const backendStyle = computed<'success' | 'error'>(() => (state.health ? 'success' : 'error'))
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

const chars = computed(() => t('statusbar.chars', { n: state.charCount }))
const tokens = computed(() =>
  state.tokenCount != null ? t('statusbar.tokens', { count: state.tokenCount }) : t('statusbar.tokensNone')
)
const elapsed = computed(() =>
  state.elapsedMs != null ? t('statusbar.elapsed', { ms: Math.round(state.elapsedMs) }) : t('statusbar.elapsedNone')
)
const nll = computed(() =>
  state.avgNll != null ? t('statusbar.nll', { n: state.avgNll.toFixed(3) }) : t('statusbar.nllNone')
)
const ppl = computed(() =>
  state.avgPpl != null ? t('statusbar.ppl', { n: fmtNum(state.avgPpl) }) : t('statusbar.pplNone')
)
const pplColor = computed(() =>
  state.avgPpl != null ? colorForPpl(state.avgPpl, settings.stops) : 'var(--muted-foreground)'
)
const coverage = computed(() =>
  state.coverage != null ? t('statusbar.coverage', { p: state.coverage.toFixed(0) }) : t('statusbar.coverageNone')
)
const position = computed(() => t('statusbar.pos', { line: state.cursorLine, col: state.cursorCol }))
</script>

<template>
  <footer class="flex h-8 shrink-0 items-center gap-1 border-t bg-background px-3 text-xs text-muted-foreground">
    <!-- Backend health -->
    <Tooltip :delay-duration="150">
      <TooltipTrigger as-child>
        <span id="st-backend" class="flex cursor-default items-center gap-1.5">
          <span class="relative flex size-2">
            <span
              v-if="state.health"
              class="absolute inline-flex size-full animate-ping rounded-full opacity-60"
              :class="backendStyle === 'success' ? 'bg-success' : 'bg-destructive'"
            ></span>
            <span
              class="relative inline-flex size-2 rounded-full"
              :class="backendStyle === 'success' ? 'bg-success' : 'bg-destructive'"
            ></span>
          </span>
          <span
            class="max-w-56 truncate"
            :class="state.health ? 'text-foreground' : 'text-destructive'"
          >{{ backendLabel }}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{{ backendHint }}</TooltipContent>
    </Tooltip>

    <Separator orientation="vertical" class="mx-1.5 h-4" />

    <!-- Statistics -->
    <Tooltip :delay-duration="150">
      <TooltipTrigger as-child>
        <span id="st-chars" class="hover:bg-accent cursor-default rounded px-1.5 py-0.5">{{ chars }}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{{ t('statusbar.charsHint') }}</TooltipContent>
    </Tooltip>

    <Tooltip :delay-duration="150">
      <TooltipTrigger as-child>
        <span
          id="st-tokens"
          class="cursor-pointer rounded px-1.5 py-0.5 text-foreground hover:bg-accent hover:text-accent-foreground"
          @click="analyze(true)"
        >{{ tokens }}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{{ t('statusbar.tokensHint') }}</TooltipContent>
    </Tooltip>

    <Tooltip :delay-duration="150">
      <TooltipTrigger as-child>
        <span id="st-elapsed" class="hover:bg-accent cursor-default rounded px-1.5 py-0.5">{{ elapsed }}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{{ t('statusbar.elapsedHint') }}</TooltipContent>
    </Tooltip>

    <Tooltip :delay-duration="150">
      <TooltipTrigger as-child>
        <span id="st-nll" class="hover:bg-accent cursor-default rounded px-1.5 py-0.5">{{ nll }}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{{ t('statusbar.nllHint') }}</TooltipContent>
    </Tooltip>

    <Tooltip :delay-duration="150">
      <TooltipTrigger as-child>
        <span
          id="st-ppl"
          class="hover:bg-accent cursor-default rounded px-1.5 py-0.5 font-semibold"
          :style="{ color: pplColor }"
        >{{ ppl }}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{{ t('statusbar.pplHint') }}</TooltipContent>
    </Tooltip>

    <Tooltip :delay-duration="150">
      <TooltipTrigger as-child>
        <span id="st-cov" class="hover:bg-accent cursor-default rounded px-1.5 py-0.5">{{ coverage }}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{{ t('statusbar.coverageHint') }}</TooltipContent>
    </Tooltip>

    <div class="flex-1" />

    <!-- Cursor position -->
    <Tooltip :delay-duration="150">
      <TooltipTrigger as-child>
        <span id="st-pos" class="font-mono text-[11px]">{{ position }}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{{ t('statusbar.posHint') }}</TooltipContent>
    </Tooltip>
  </footer>
</template>