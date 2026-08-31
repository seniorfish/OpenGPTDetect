// ---------- Hostname list matching (shared by site lists and adapter overrides) ----------
// Extracted from the content script's isAllowed() so per-adapter URL overrides
// use the exact same pattern semantics as the global whitelist/blacklist.

/**
 * True when `hostname` matches any pattern in `list`.
 * 'example.com' matches the host and every subdomain; '*.example.com' matches
 * example.com itself plus subdomains. Case-insensitive; blank entries ignored.
 */
export function hostMatchesList(hostname: string, list: string[]): boolean {
  const host = hostname.toLowerCase()
  return list.some((raw) => {
    const pat = raw.trim().toLowerCase()
    if (!pat) return false
    if (pat.startsWith('*.')) {
      const tail = pat.slice(1)
      return host === pat.slice(2) || host.endsWith(tail)
    }
    return host === pat || host.endsWith('.' + pat)
  })
}
