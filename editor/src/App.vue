<script setup lang="ts">
// ---------- Root layout ----------
// One nested strip: header | editor stage | histogram card | status bar.
// Mounts the CodeMirror editor into the stage element, wires the global Ctrl+K
// palette shortcut, hosts the sonner Toaster, and conditionally mounts the
// business dialogs off the shared modal state.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from './i18n.ts'
import AppHeader from './components/AppHeader.vue'
import CommandPalette from './components/CommandPalette.vue'
import StatusBar from './components/StatusBar.vue'
import HistogramPanel from './components/HistogramPanel.vue'
import SettingsDialog from './components/dialogs/SettingsDialog.vue'
import SavePresetDialog from './components/dialogs/SavePresetDialog.vue'
import ManagePresetsDialog from './components/dialogs/ManagePresetsDialog.vue'
import IgnoreListDialog from './components/dialogs/IgnoreListDialog.vue'
import { Toaster as Sonner } from './components/ui/sonner'
import { TooltipProvider } from './components/ui/tooltip'
import { useApp } from './composables/useApp.ts'
import { initLocaleHooks } from './commands.ts'
import { useTheme } from './theme.ts'
import type { SupportedLocale } from './i18n.ts'

const app = useApp()
const { state } = app
const { t, locale } = useI18n()
const { resolved } = useTheme()

const editorWrap = ref<HTMLElement | null>(null)
const paletteOpen = ref(false)

onMounted(() => {
  if (editorWrap.value) {
    app.initEditor(editorWrap.value)
    app.startHealthPolling()
  }
  // Command palette global shortcut: Ctrl+K / Cmd+K.
  window.addEventListener('keydown', onGlobalKeydown)
  // Give the command registry the locale wiring (keeps command active states accurate).
  initLocaleHooks((l) => { locale.value = l }, () => locale.value as SupportedLocale)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  app.destroyEditor()
})

function onGlobalKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    paletteOpen.value = !paletteOpen.value
  }
}
</script>

<template>
  <TooltipProvider :delay-duration="150">
    <div class="flex h-full flex-col">
      <AppHeader @open-palette="paletteOpen = true" />

      <!-- Editor stage -->
      <main class="flex min-h-0 flex-1 items-stretch px-4 py-4">
        <div ref="editorWrap" class="editor-wrap"></div>
      </main>

      <HistogramPanel />
      <StatusBar />

      <!-- Business dialogs (driven by the shared modal state) -->
      <SettingsDialog v-if="state.activeModal === 'settings'" />
      <SavePresetDialog v-if="state.activeModal === 'savePreset'" />
      <ManagePresetsDialog v-if="state.activeModal === 'managePresets'" />
      <IgnoreListDialog v-if="state.activeModal === 'ignoreList'" />

      <!-- Command palette + toasts -->
      <CommandPalette v-model:open="paletteOpen" />
      <Sonner position="bottom-center" :theme="resolved" />
    </div>
  </TooltipProvider>
</template>