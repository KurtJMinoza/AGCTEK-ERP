import { movingAverage, splitAcrossWeeks } from './demand-plan.generate'

describe('movingAverage', () => {
    it('averages the last N bucket totals', () => {
        expect(movingAverage([10, 20, 30, 40, 50], 4)).toBe(35)
    })

    it('ignores periods before the first actual, counts later gaps as zero', () => {
        expect(movingAverage([null, null, 40, 20], 4)).toBe(30)
        expect(movingAverage([40, null, 20, 0], 4)).toBe(15)
    })

    it('returns null without any history', () => {
        expect(movingAverage([null, null], 4)).toBeNull()
        expect(movingAverage([], 12)).toBeNull()
    })

    it('uses monthly sums, not weekly values (bucket conversion happens first)', () => {
        const weekly = [100, 100, 100, 100, 100, 100, 100, 100, 100]
        const monthly = [weekly.slice(0, 4), weekly.slice(4, 9)].map((w) =>
            w.reduce((s, v) => s + v, 0),
        )
        expect(movingAverage(monthly, 4)).toBe((400 + 500) / 2)
        expect(movingAverage(weekly, 4)).toBe(100)
    })
})

describe('splitAcrossWeeks', () => {
    it('splits a month total into whole units that sum exactly', () => {
        const parts = splitAcrossWeeks(1003, 4)
        expect(parts).toEqual([251, 251, 251, 250])
        expect(parts.reduce((s, v) => s + v, 0)).toBe(1003)
    })

    it('rounds the bucket total first', () => {
        expect(splitAcrossWeeks(10.6, 5)).toEqual([3, 2, 2, 2, 2])
    })
})
