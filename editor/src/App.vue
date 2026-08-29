<script setup lang="ts">
// ---------- Root layout: wires the controller into presentational components ----------
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from './i18n.ts'
import Toolbar from './components/Toolbar.vue'
import StatusBar from './components/StatusBar.vue'
import HistogramPanel from './components/HistogramPanel.vue'
import ToastHost from './components/ToastHost.vue'
import Modal from './components/ui/Modal.vue'
import SettingsModal from './components/modals/SettingsModal.vue'
import SavePresetModal from './components/modals/SavePresetModal.vue'
import ManagePresetsModal from './components/modals/ManagePresetsModal.vue'
import IgnoreListModal from './components/modals/IgnoreListModal.vue'
import { useApp } from './composables/useApp.ts'

const app = useApp()
const { state } = app
const { t } = useI18n()
const editorWrap = ref<HTMLElement | null>(null)

onMounted(() => {
  if (editorWrap.value) {
    app.initEditor(editorWrap.value)
    app.startHealthPolling()
  }
})

onBeforeUnmount(() => app.destroyEditor())
</script>

<template>
  <Toolbar />
  <div class="editor-wrap" id="editor-wrap" ref="editorWrap"></div>
  <HistogramPanel />
  <StatusBar />

  <Modal
    v-if="state.activeModal === 'savePreset'"
    :title="t('modal.savePreset.title')"
    @close="app.closeModal"
  >
    <SavePresetModal @close="app.closeModal" />
  </Modal>

  <Modal
    v-if="state.activeModal === 'managePresets'"
    :title="t('modal.manage.title')"
    @close="app.closeModal"
  >
    <ManagePresetsModal @close="app.closeModal" />
  </Modal>

  <Modal
    v-if="state.activeModal === 'settings'"
    :title="t('modal.settings.title')"
    @close="app.closeModal"
  >
    <SettingsModal />
  </Modal>

  <Modal
    v-if="state.activeModal === 'ignoreList'"
    :title="t('modal.ignore.title')"
    @close="app.closeModal"
  >
    <IgnoreListModal />
  </Modal>

  <ToastHost />
</template>