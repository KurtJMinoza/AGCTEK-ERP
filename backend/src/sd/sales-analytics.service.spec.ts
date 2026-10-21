import { bucketLabels, resolveRange } from './sales-analytics.service'

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

    it('lists months for year to date', () => {
        const { from } = resolveRange('ytd', NOW)
        const labels = bucketLabels(from, NOW, 'month')
        expect(labels[0]).toBe('2026-01')
        expect(labels.at(-1)).toBe('2026-10')
        expect(labels).toHaveLength(10)
    })
})
