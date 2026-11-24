import { BadRequestException } from '@nestjs/common'
import { assertChargeAllowed, resolveChargeDueDate } from './pos-charge'

// 2026-11-19 09:00 Manila = 01:00 UTC
const NOW = new Date('2026-11-19T01:00:00.000Z')

describe('resolveChargeDueDate', () => {
    it('requires a due date', () => {
        expect(() => resolveChargeDueDate(undefined, NOW)).toThrow(
            BadRequestException,
        )
        expect(() => resolveChargeDueDate('  ', NOW)).toThrow('due date')
    })

    it('rejects text that is not a date', () => {
        expect(() => resolveChargeDueDate('tomorrow-ish', NOW)).toThrow(
            'not a valid date',
        )
    })

    it('accepts today, tomorrow and later', () => {
        expect(resolveChargeDueDate('2026-11-19', NOW)).toEqual(
            new Date('2026-11-19T00:00:00.000Z'),
        )
        expect(() => resolveChargeDueDate('2026-11-20', NOW)).not.toThrow()
        expect(() =>
            resolveChargeDueDate('2027-01-15T00:00:00.000Z', NOW),
        ).not.toThrow()
    })

    it('rejects a day that already passed', () => {
        expect(() => resolveChargeDueDate('2026-11-18', NOW)).toThrow(
            'cannot be in the past',
        )
    })

    it('treats the Manila day as today late in the evening', () => {
        // 2026-11-19 23:30 Manila = 15:30 UTC: today is still allowed.
        const lateEvening = new Date('2026-11-19T15:30:00.000Z')
        expect(() =>
            resolveChargeDueDate('2026-11-19', lateEvening),
        ).not.toThrow()
        // 2026-11-20 00:30 Manila = 16:30 UTC on the 19th: yesterday is gone.
        const justAfterMidnight = new Date('2026-11-19T16:30:00.000Z')
        expect(() =>
            resolveChargeDueDate('2026-11-19', justAfterMidnight),
        ).toThrow('cannot be in the past')
    })
})

describe('assertChargeAllowed', () => {
    const credit = (limit: number) => ({
        id: 'c1',
        customerAccountType: 'CREDIT',
        creditLimit: limit,
    })

    it('requires an identified customer', () => {
        expect(() =>
            assertChargeAllowed({ customer: null, total: 100, openExposure: 0 }),
        ).toThrow('identified customer')
        expect(() =>
            assertChargeAllowed({
                customer: { id: 'WALK-IN' },
                total: 100,
                openExposure: 0,
            }),
        ).toThrow('identified customer')
    })

    it('does not limit a customer without a credit account', () => {
        expect(() =>
            assertChargeAllowed({
                customer: { id: 'c1', customerAccountType: 'NON_CREDIT' },
                total: 1_000_000,
                openExposure: 500_000,
            }),
        ).not.toThrow()
    })

    it('holds a CREDIT account to limit minus what it already owes', () => {
        expect(() =>
            assertChargeAllowed({
                customer: credit(10000),
                total: 4000,
                openExposure: 6000,
            }),
        ).not.toThrow() // exactly the limit
        expect(() =>
            assertChargeAllowed({
                customer: credit(10000),
                total: 4000.01,
                openExposure: 6000,
            }),
        ).toThrow('Credit limit exceeded: ₱4000.00 available')
    })

    it('reports zero available when the customer is over the limit already', () => {
        expect(() =>
            assertChargeAllowed({
                customer: credit(1000),
                total: 10,
                openExposure: 1500,
            }),
        ).toThrow('₱0.00 available')
    })
})
