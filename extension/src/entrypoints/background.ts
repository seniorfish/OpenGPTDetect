// Proxy for the local model service (page CORS/CSP bypass) + toggle shortcut.
// Payload parsing and the message registry arrive with the content orchestration (S5).
export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    // Defaults are declared in storage items (see src/utils/storage.ts, S5).
  })
})
