// Page scan + annotation orchestration. Skeleton only: the scan pipeline (S5)
// and the shadow-root overlay UI (S6) mount here.
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Orchestrator lands in S5.
  }
})
