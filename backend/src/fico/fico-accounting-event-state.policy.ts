import type { FicoAccountingEventStatus } from './fico-accounting-event.constants'

const ALLOWED: Record<string, readonly FicoAccountingEventStatus[]> = {
    PENDING: ['PROCESSING', 'SKIPPED'],
    RETRY_SCHEDULED: ['PROCESSING', 'SKIPPED'],
    PROCESSING: ['CONSUMED', 'FAILED', 'RETRY_SCHEDULED', 'DEAD_LETTER', 'SKIPPED', 'PENDING'],
    FAILED: ['PROCESSING', 'RETRY_SCHEDULED', 'PENDING'],
    CONSUMED: [],
    SKIPPED: [],
    DEAD_LETTER: ['PENDING'],
}

export function ficoAccountingEventCanTransition(
    from: string,
    to: FicoAccountingEventStatus,
): boolean {
    const allowed = ALLOWED[from.toUpperCase()]
    if (!allowed) return false
    return allowed.includes(to)
}

/** Exponential backoff in milliseconds (capped). */
export function ficoAccountingRetryDelayMs(attemptCount: number): number {
    const base = 15_000
    const exponent = Math.min(Math.max(attemptCount, 1) - 1, 6)
    return Math.min(base * 2 ** exponent, 30 * 60_000)
}