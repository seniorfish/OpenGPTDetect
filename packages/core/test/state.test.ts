import { describe, it, expect } from 'vitest'
import { transition, isTerminal, INITIAL_MEASURE_STATE, type MeasureState } from '../src/state.ts'

describe('measure state machine', () => {
  it('runs the happy path queued -> measuring -> done', () => {
    let s = transition(INITIAL_MEASURE_STATE, { type: 'start' })
    expect(s).toEqual({ kind: 'measuring' })
    s = transition(s, { type: 'result', avgPpl: 12.5 })
    expect(s).toEqual({ kind: 'done', avgPpl: 12.5 })
    expect(isTerminal(s)).toBe(true)
  })

  it('supports skip and fail/retry paths', () => {
    expect(transition(INITIAL_MEASURE_STATE, { type: 'skip' })).toEqual({ kind: 'skipped' })

    let s: MeasureState = transition(INITIAL_MEASURE_STATE, { type: 'fail', code: 'oom' })
    expect(s).toEqual({ kind: 'error', code: 'oom' })
    s = transition(s, { type: 'retry' })
    expect(s).toEqual({ kind: 'queued' })
    s = transition(s, { type: 'start' })
    expect(s.kind).toBe('measuring')
  })

  it('throws on illegal transitions', () => {
    const done: MeasureState = { kind: 'done', avgPpl: 1 }
    expect(() => transition(done, { type: 'start' })).toThrow(/illegal transition/)
    expect(() => transition({ kind: 'queued' }, { type: 'result', avgPpl: 1 })).toThrow()
    expect(() => transition({ kind: 'measuring' }, { type: 'skip' })).toThrow()
    expect(() => transition({ kind: 'error', code: 'http' }, { type: 'skip' })).toThrow()
  })
})
