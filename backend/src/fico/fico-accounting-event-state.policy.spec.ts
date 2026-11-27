import {
    ficoAccountingEventCanTransition,
    ficoAccountingRetryDelayMs,
} from './fico-accounting-event-state.policy'

describe('fico-accounting-event-state.policy', () => {
    it('allows valid lifecycle transitions', () => {
        expect(ficoAccountingEventCanTransition('PENDING', 'PROCESSING')).toBe(
            true,
        )
        expect(ficoAccountingEventCanTransition('CONSUMED', 'PENDING')).toBe(
            false,
        )
        expect(ficoAccountingEventCanTransition('DEAD_LETTER', 'PENDING')).toBe(
            true,
        )
    })

    it('increases retry delay with attempts', () => {
        expect(ficoAccountingRetryDelayMs(1)).toBeLessThan(
            ficoAccountingRetryDelayMs(4),
        )
    })
})