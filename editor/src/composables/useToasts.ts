// ---------- Toast queue (a single transient message) ----------
import { reactive } from 'vue'

export type ToastType = 'info' | 'warn' | 'error'

const state = reactive({
  msg: '',
  type: 'info' as ToastType,
  visible: false
})

let timer: ReturnType<typeof setTimeout> | undefined

/** Display a toast for a few seconds (replacing any current one). */
export function toast(msg: string, type: ToastType = 'info'): void {
  state.msg = msg
  state.type = type
  state.visible = true
  clearTimeout(timer)
  timer = setTimeout(() => {
    state.visible = false
  }, 4500)
}

/** Reactive toast state, consumed by <ToastHost>. */
export function useToastState(): { msg: string; type: ToastType; visible: boolean } {
  return state
}