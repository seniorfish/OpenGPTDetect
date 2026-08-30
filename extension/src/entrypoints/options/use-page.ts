// ---------- Tiny hash router for the options page ----------
// Extension pages cannot change URL paths, so navigation lives in the hash
// (#/measure). No routing library (project rule): a page id union + hashchange.
import { useEffect, useState } from 'react'

export const PAGE_IDS = [
  'general',
  'extraction',
  'measure',
  'ai',
  'heatmap',
  'sites',
  'about',
] as const
export type PageId = (typeof PAGE_IDS)[number]

function fromHash(hash: string): PageId {
  const id = hash.replace(/^#\//, '') as PageId
  return PAGE_IDS.includes(id) ? id : 'general'
}

export function usePage(): [PageId, (next: PageId) => void] {
  const [page, setPage] = useState<PageId>(() => fromHash(location.hash))

  useEffect(() => {
    const onHash = (): void => setPage(fromHash(location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = (next: PageId): void => {
    location.hash = '/' + next
  }

  return [page, navigate]
}
