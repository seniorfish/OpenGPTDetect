// ---------- Toast bridge ----------
// Preserves the app-wide `toast(msg, type)` contract while rendering through
// sonner (the shadcn/ui toast stack). The single <Toaster /> mount in App.tsx
// does the actual rendering; this module only forwards the call.
import { toast as sonnerToast } from 'sonner'

export type ToastType = 'info' | 'warn' | 'error'

/** Display a toast. `warn` and `error` map to sonner's level semantics. */
export function toast(msg: string, type: ToastType = 'info'): void {
  if (type === 'error') sonnerToast.error(msg)
  else if (type === 'warn') sonnerToast.warning(msg)
  else sonnerToast(msg)
}