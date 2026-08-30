import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  BUILTIN_PROFILES,
  parseProfile,
  tryParseProfile,
  profileIssues,
  PplScaleProfileSchema,
  PROFILE_SCHEMA_VERSION
} from '../src/scale.ts'

describe('builtin profiles', () => {
  it('all parse against the schema and have unique ids', () => {
    const ids = new Set<string>()
    for (const p of BUILTIN_PROFILES) {
      expect(() => parseProfile(p)).not.toThrow()
      expect(ids.has(p.id)).toBe(false)
      ids.add(p.id)
      expect(p.schemaVersion).toBe(PROFILE_SCHEMA_VERSION)
    }
  })

  it('readable as JSON text (community-exportable shape)', () => {
    const text = JSON.stringify(BUILTIN_PROFILES[0], null, 2)
    expect(parseProfile(JSON.parse(text)).id).toBe('zh-default-2026')
  })
})

describe('parseProfile validation', () => {
  const good = {
    schemaVersion: 1,
    id: 'x',
    name: 'X',
    scope: 'whatever',
    scale: { mode: 'linear', stops: [{ ppl: 1, color: '#22c55e' }] },
    guideline: { aiLikePplMax: 1, humanLikePplMin: 2, hardPplMin: 3 }
  }

  it('accepts the minimal valid profile', () => {
    expect(parseProfile(good).id).toBe('x')
  })

  it('rejects missing scope (it is the applicability description)', () => {
    const { scope: _scope, ...rest } = good
    expect(tryParseProfile(rest)).toBeNull()
    expect(profileIssues(rest).some((m) => m.includes('scope'))).toBe(true)
  })

  it('rejects non-hex colors and negative ppl', () => {
    expect(tryParseProfile({ ...good, scale: { mode: 'linear', stops: [{ ppl: 1, color: 'red' }] } })).toBeNull()
    expect(tryParseProfile({ ...good, scale: { mode: 'linear', stops: [{ ppl: -1, color: '#22c55e' }] } })).toBeNull()
  })

  it('rejects unknown schemaVersion', () => {
    expect(tryParseProfile({ ...good, schemaVersion: 2 })).toBeNull()
  })
})

describe('z.toJSONSchema (canonical JSON Schema for Python/community)', () => {
  it('produces an object schema with the key members', () => {
    const doc = z.toJSONSchema(PplScaleProfileSchema, { target: 'draft-2020-12' }) as Record<string, unknown>
    expect(doc.type).toBe('object')
    const props = doc.properties as Record<string, unknown>
    expect(props.schemaVersion).toBeTruthy()
    expect(props.scope).toBeTruthy()
    expect(props.guideline).toBeTruthy()
    expect((doc.required as string[]).includes('id')).toBe(true)
  })
})
