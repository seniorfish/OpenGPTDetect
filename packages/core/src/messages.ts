// ---------- Message contract between extension entrypoints ----------
// Types only: the runtime transports (background/content/popup) implement the
// `send`/`on` wrappers in the extension package; both sides compile against this
// single map so a new message is one row here and nowhere else.
import type { HealthResponse, PplResponse } from './schemas.ts'

export interface MessageMap {
  ppl: {
    req: { baseUrl: string; text: string }
    res: { ok: true; data: PplResponse } | { ok: false; status?: number; error: string }
  }
  health: {
    req: { baseUrl: string }
    res: { ok: true; data: HealthResponse } | { ok: false; status?: number; error?: string }
  }
  'settings:get': {
    req: Record<string, never>
    // Data shape is app-defined; the receiving layer parses it via its own schema.
    res: { ok: true; data: unknown } | { ok: false; error: string }
  }
  'settings:set': {
    req: { patch: Record<string, unknown> }
    res: { ok: true } | { ok: false; error: string }
  }
  'enabled-toggled': {
    req: { enabled: boolean }
    res: Record<string, never>
  }
  remeasure: {
    req: Record<string, never>
    res: Record<string, never>
  }
  ping: {
    req: Record<string, never>
    res: Record<string, never>
  }
}

export type MessageType = keyof MessageMap
export type MessageReq<T extends MessageType> = MessageMap[T]['req']
export type MessageRes<T extends MessageType> = MessageMap[T]['res']
