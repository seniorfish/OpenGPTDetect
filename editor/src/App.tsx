// ---------- Root layout ----------
// One nested strip: header | editor stage | histogram card | status bar.
// Mounts the CodeMirror editor into the stage element, wires the global Ctrl+K
// palette shortcut, hosts the sonner Toaster, and conditionally mounts the
// business dialogs off the shared modal state.
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/stores/app.ts'
import { useTheme } from '@/theme.ts'
import { TooltipProvider } from '@opengptdetect/ui'
import { Toaster } from '@opengptdetect/ui'
import { AppHeader } from '@/components/AppHeader.tsx'
import { CommandPalette } from '@/components/CommandPalette.tsx'
import { StatusBar } from '@/components/StatusBar.tsx'
import { HistogramPanel } from '@/components/HistogramPanel.tsx'
import { SettingsDialog } from '@/components/dialogs/SettingsDialog.tsx'
import { SavePresetDialog } from '@/components/dialogs/SavePresetDialog.tsx'
import { ManagePresetsDialog } from '@/components/dialogs/ManagePresetsDialog.tsx'

export default function App() {
  const editorWrap = useRef<HTMLDivElement | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { resolved } = useTheme()
  const activeModal = useAppStore((s) => s.activeModal)

  useEffect(() => {
    if (editorWrap.current) {
      useAppStore.getState().initEditor(editorWrap.current)
      useAppStore.getState().startHealthPolling()
    }
    // Command palette global shortcut: Ctrl+K / Cmd+K.
    const onGlobalKeydown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onGlobalKeydown)
    return () => {
      window.removeEventListener('keydown', onGlobalKeydown)
      useAppStore.getState().destroyEditor()
    }
  }, [])

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full flex-col">
        <AppHeader onOpenPalette={() => setPaletteOpen(true)} />

        {/* Editor stage */}
        <main className="flex min-h-0 flex-1 items-stretch px-4 py-4">
          <div ref={editorWrap} className="editor-wrap" />
        </main>

        <HistogramPanel />
        <StatusBar />

        {/* Business dialogs (driven by the shared modal state) */}
        {activeModal === 'settings' && <SettingsDialog />}
        {activeModal === 'savePreset' && <SavePresetDialog />}
        {activeModal === 'managePresets' && <ManagePresetsDialog />}

        {/* Command palette + toasts */}
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <Toaster position="bottom-center" theme={resolved} />
      </div>
    </TooltipProvider>
  )
}