// ---------- Typed runtime for core/messages ----------
// `core/messages.ts` defines the contract; this file binds it to chrome.runtime.
// A new message is one row in the registry plus one handler here — never a bare
// string anywhere else.
import type { MessageType, MessageReq, MessageRes } from '@opengptdetect/core'
import { browser, type Browser } from 'wxt/browser'

/** Send a typed message from content/popup/options to the background. */
export function send<T extends MessageType>(type: T, req: MessageReq<T>): Promise<MessageRes<T>> {
  return browser.runtime.sendMessage({ type, ...req }) as Promise<MessageRes<T>>
}

/** Register a typed handler on the background side. */
export function on<T extends MessageType>(
  type: T,
  handler: (req: MessageReq<T>) => MessageRes<T> | Promise<MessageRes<T>>
): void {
  browser.runtime.onMessage.addListener(
    (
      msg: unknown,
      _sender: Browser.runtime.MessageSender,
      sendResponse: (r: unknown) => void
    ): boolean | undefined => {
      if (!msg || typeof msg !== 'object') return
      const m = msg as Record<string, unknown>
      if (m.type !== type) return
      const { type: _type, ...req } = m as MessageReq<T> & { type?: string }
      Promise.resolve(handler(req as MessageReq<T>)).then(sendResponse)
      return true // keep the channel open for the async response
    }
  )
}
