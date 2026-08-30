// ---------- Floating UI mount manager ----------
// Wraps a single WXT shadow-root UI (the block detail popover). The vanilla
// content script drives it through open/close; the React view lives inside the
// shadow root and all Radix portal targets point back into it.
import { createRoot } from 'react-dom/client'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import {
  BlockDetailPopover,
  setDetail,
  type BlockDetailInput,
} from '../components/block-detail.tsx'

export interface FloatingUi {
  /** Open the detail for a block, or close it if that block's popover is already open. */
  open(anchor: Element, detail: BlockDetailInput): void
  close(): void
  remove(): void
}

export async function mountFloatingUi(ctx: ContentScriptContext): Promise<FloatingUi> {
  const ui = await createShadowRootUi(ctx, {
    name: 'ppl-block-detail',
    position: 'overlay',
    zIndex: 2147480000,
    onMount(container) {
      const root = createRoot(container)
      root.render(<BlockDetailPopover portalTarget={container} onDismiss={close} />)
      return root
    },
    onRemove(root) {
      root?.unmount()
    },
  })
  ui.mount()

  let lastOpen: Element | null = null

  function close(): void {
    lastOpen = null
    setDetail(null)
  }

  return {
    open(anchor, detail) {
      if (lastOpen === anchor) {
        close()
        return
      }
      lastOpen = anchor
      const rect = anchor.getBoundingClientRect()
      setDetail(detail, { left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    },
    close,
    remove() {
      close()
      ui.remove()
    },
  }
}
