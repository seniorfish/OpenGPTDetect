// ---------- Error contract ----------
// Stable error codes shared by every consumer (content orchestration, background
// proxy, popup/options UI). UI layers map codes -> localized messages; the codes
// themselves never change shape.

export type ErrorCode =
  | 'http' // backend returned a non-2xx status
  | 'timeout' // request aborted by the timeout
  | 'network' // fetch failed / transport error
  | 'oom' // service ran out of memory (500 on a large chunk)
  | 'invalid-response' // payload failed Zod validation
  | 'unknown'

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number

  constructor(code: ErrorCode, message?: string, status = 0) {
    super(message ?? code)
    this.name = 'AppError'
    this.code = code
    this.status = status
  }
}

/** Normalize any thrown value into an AppError. */
export function asAppError(e: unknown, fallback: ErrorCode = 'unknown'): AppError {
  if (e instanceof AppError) return e
  if (e instanceof Error) return new AppError(fallback, e.message)
  return new AppError(fallback, String(e))
}
