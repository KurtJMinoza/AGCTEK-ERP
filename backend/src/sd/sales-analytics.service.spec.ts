import {
    bucketLabels,
    normalizeSalesLinePaidStatus,
    previousWindow,
    resolveCustomRange,
    resolveRange,
    summarizeLinePayments,
} from './sales-analytics.service'

describe('summarizeLinePayments', () => {
    it('reports a Cash + GCash sale as split with both tenders', () => {
        const result = summarizeLinePayments('SPLIT', [
            { method: 'CASH', amount: 500, reference: null, status: 'Paid' },
            { method: 'GCASH', amount: 109.55, reference: '123123123', status: 'Paid' },
        ])
        expect(result.paymentMethod).toBe('SPLIT')
        expect(result.payments).toEqual([
            { method: 'CASH', amount: 500, reference: '', status: 'Paid' },
            { method: 'GCASH', amount: 109.55, reference: '123123123', status: 'Paid' },
        ])
    })

    it('treats two distinct methods as split even if the order says otherwise', () => {
        const result = summarizeLinePayments('CASH', [
            { method: 'CASH', amount: 10 },
            { method: 'GCASH', amount: 5 },
        ])
        expect(result.paymentMethod).toBe('SPLIT')
    })

    it('keeps a down payment plus a later collection of one method as that method', () => {
        const result = summarizeLinePayments('CASH', [
            { method: 'CASH', amount: 290 },
            { method: 'CASH', amount: 175.55 },
        ])
        expect(result.paymentMethod).toBe('CASH')
        expect(result.payments).toHaveLength(2)
    })

    it('falls back to the first tender and handles missing data', () => {
        expect(summarizeLinePayments(null, [{ method: 'GCASH', amount: 1 }]).paymentMethod).toBe('GCASH')
        expect(summarizeLinePayments(null, null)).toEqual({ paymentMethod: '', payments: [] })
    })
})

// 2026-10-17 01:30 in Manila (UTC+8) = 2026-10-16 17:30 UTC.
const NOW = new Date('2026-10-16T17:30:00.000Z')

describe('resolveRange (Manila calendar)', () => {
    it.each([
        ['today', '2026-10-16T16:00:00.000Z', 'day'],
        ['7days', '2026-10-10T16:00:00.000Z', 'day'],
        ['month', '2026-09-30T16:00:00.000Z', 'day'],
        ['ytd', '2025-12-31T16:00:00.000Z', 'month'],
    ] as const)('%s starts at Manila midnight', (range, from, bucket) => {
        const resolved = resolveRange(range, NOW)
        expect(resolved.from.toISOString()).toBe(from)
        expect(resolved.bucket).toBe(bucket)
    })
})

describe('bucketLabels', () => {
    it('lists every Manila day in the range, including today', () => {
        const { from } = resolveRange('7days', NOW)
        expect(bucketLabels(from, NOW, 'day')).toEqual([
            '2026-10-11',
            '2026-10-12',
            '2026-10-13',
            '2026-10-14',
            '2026-10-15',
            '2026-10-16',
            '2026-10-17',
        ])
    })

    it('resolves an inclusive Manila custom range', () => {
        const { from, to, bucket } = resolveCustomRange(
            '2026-10-11',
            '2026-10-17',
            NOW,
        )
        expect(from.toISOString()).toBe('2026-10-10T16:00:00.000Z')
        expect(to.toISOString()).toBe(NOW.toISOString())
        expect(bucket).toBe('day')
    })

    it('compares against the window of the same length just before', () => {
        const { from } = resolveRange('7days', NOW)
        const previous = previousWindow(from, NOW)
        expect(previous.to.toISOString()).toBe(from.toISOString())
        expect(previous.from.toISOString()).toBe('2026-10-04T14:30:00.000Z')
    })

    it('lists months for year to date', () => {
        const { from } = resolveRange('ytd', NOW)
        const labels = bucketLabels(from, NOW, 'month')
        expect(labels[0]).toBe('2026-01')
        expect(labels.at(-1)).toBe('2026-10')
        expect(labels).toHaveLength(10)
    })
})

describe('normalizeSalesLinePaidStatus', () => {
    it.each([
        [{ paymentStatus: 'Paid' }, 'Paid'],
        [{ paymentStatus: 'paid' }, 'Paid'],
        [{ paymentStatus: 'Authorized' }, 'Paid'],
        [{ paymentStatus: 'Unpaid' }, 'Unpaid'],
        [{ paymentStatus: 'Pending Verification' }, 'Unpaid'],
        [{ paymentStatus: 'Pending Collection' }, 'Unpaid'],
        [{ paymentStatus: 'PARTIALLY_PAID' }, 'Partially Paid'],
        [{ paymentStatus: 'Partially Paid' }, 'Partially Paid'],
        [{ paymentStatus: 'Paid', outstandingBalance: 50 }, 'Partially Paid'],
        [{ paymentStatus: null, orderStatus: 'COMPLETED' }, 'Paid'],
        [{ paymentStatus: '', orderStatus: 'DRAFT' }, 'Unpaid'],
        [{ paymentStatus: null }, 'Unpaid'],
    ] as const)('%j → %s', (input, expected) => {
        expect(normalizeSalesLinePaidStatus(input)).toBe(expected)
    })
})
