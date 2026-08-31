import { describe, expect, it } from 'vitest'
import { hostMatchesList } from '../src/lib/url-match.ts'

describe('hostMatchesList', () => {
  it('matches the exact host', () => {
    expect(hostMatchesList('example.com', ['example.com'])).toBe(true)
  })

  it('matches subdomains of a bare pattern', () => {
    expect(hostMatchesList('a.example.com', ['example.com'])).toBe(true)
    expect(hostMatchesList('deep.a.example.com', ['example.com'])).toBe(true)
  })

  it('does not match a negative suffix', () => {
    expect(hostMatchesList('evilx.com', ['x.com'])).toBe(false)
    expect(hostMatchesList('notexample.com', ['example.com'])).toBe(false)
  })

  it("supports the '*.host' variant (apex + subdomains)", () => {
    expect(hostMatchesList('example.com', ['*.example.com'])).toBe(true)
    expect(hostMatchesList('a.example.com', ['*.example.com'])).toBe(true)
  })

  it('is case-insensitive on both sides', () => {
    expect(hostMatchesList('WWW.Example.COM', ['example.com'])).toBe(true)
    expect(hostMatchesList('www.example.com', ['  EXAMPLE.COM  '])).toBe(true)
  })

  it('ignores blank entries', () => {
    expect(hostMatchesList('example.com', ['', '   '])).toBe(false)
  })

  it('returns false for an empty list', () => {
    expect(hostMatchesList('example.com', [])).toBe(false)
  })

  it('matches when any entry hits', () => {
    expect(hostMatchesList('a.example.com', ['other.com', 'example.com'])).toBe(true)
  })
})
