import {
    addPeriods,
    buildPeriods,
    freezeUntilFor,
    periodLabel,
    periodStartOf,
} from './demand-plan.periods'

describe('demand-plan periods', () => {
    const wed = new Date(Date.UTC(2026, 8, 30)) // Wed 30 Sep 2026

    it('aligns weeks to Monday (matches Postgres date_trunc week)', () => {
        expect(periodStartOf(wed, 'WEEK').toISOString()).toBe(
            '2026-09-28T00:00:00.000Z',
        )
        const sunday = new Date(Date.UTC(2026, 9, 4))
        expect(periodStartOf(sunday, 'WEEK').toISOString()).toBe(
            '2026-09-28T00:00:00.000Z',
        )
    })

    it('aligns months and quarters', () => {
        expect(periodStartOf(wed, 'MONTH').toISOString()).toBe(
            '2026-09-01T00:00:00.000Z',
        )
        expect(periodStartOf(wed, 'QUARTER').toISOString()).toBe(
            '2026-07-01T00:00:00.000Z',
        )
    })

    it('adds periods per bucket', () => {
        const q = periodStartOf(wed, 'QUARTER')
        expect(addPeriods(q, 'QUARTER', 2).toISOString()).toBe(
            '2027-01-01T00:00:00.000Z',
        )
        expect(periodLabel(addPeriods(q, 'QUARTER', 2), 'QUARTER')).toBe(
            'Q1 2027',
        )
    })

    it('marks periods inside the freeze fence as frozen', () => {
        const freezeUntil = freezeUntilFor('WEEK', 2, wed)
        const periods = buildPeriods(
            periodStartOf(wed, 'WEEK'),
            'WEEK',
            4,
            freezeUntil,
        )
        expect(periods.map((p) => p.frozen)).toEqual([true, true, false, false])
    })
})
