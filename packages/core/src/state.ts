// ---------- Measure pipeline state machine (explicit, library-free) ----------
// The per-unit lifecycle of the extension scan pipeline: queued -> measuring ->
// done / error, plus skip and an explicit retry path (OOM half-retry).
// A pure transition table: illegal transitions throw, so tests lock the matrix.
import type { ErrorCode } from './errors.ts'

export type MeasureState =
  | { kind: 'queued' }
  | { kind: 'skipped' }
  | { kind: 'measuring' }
  | { kind: 'done'; avgPpl: number | null }
  | { kind: 'error'; code: ErrorCode }

export type MeasureEvent =
  | { type: 'enqueue' }
  | { type: 'skip' }
  | { type: 'start' }
  | { type: 'result'; avgPpl: number | null }
  | { type: 'fail'; code: ErrorCode }
  | { type: 'retry' }

export const INITIAL_MEASURE_STATE: MeasureState = { kind: 'queued' }

export function transition(state: MeasureState, event: MeasureEvent): MeasureState {
  switch (state.kind) {
    case 'queued':
      if (event.type === 'start') return { kind: 'measuring' }
      if (event.type === 'skip') return { kind: 'skipped' }
      if (event.type === 'fail') return { kind: 'error', code: event.code }
      break
    case 'measuring':
      if (event.type === 'result') return { kind: 'done', avgPpl: event.avgPpl }
      if (event.type === 'fail') return { kind: 'error', code: event.code }
      break
    case 'error':
      if (event.type === 'retry') return { kind: 'queued' }
      break
    case 'done':
    case 'skipped':
      break
  }
  throw new Error(`illegal transition: ${state.kind} + ${event.type}`)
}

export function isTerminal(state: MeasureState): boolean {
  return state.kind === 'done' || state.kind === 'error' || state.kind === 'skipped'
}
