import { BadRequestException } from '@nestjs/common'
import {
    SalesPerformanceService,
    percentOf,
    resolvePerformanceWindows,
} from './sales-performance.service'

describe('resolvePerformanceWindows', () => {
    // 2026-11-19 15:00 Manila
    const now = new Date('2026-11-19T07:00:00.000Z')

    it('defaults to the current Manila month and caps both windows at now', () => {
        const w = resolvePerformanceWindows(undefined, now)
        expect(w.month).toBe('2026-11')
        expect(w.monthNumber).toBe(11)
        expect(w.ytd.from.toISOString()).toBe('2025-12-31T16:00:00.000Z')
        expect(w.mth.from.toISOString()).toBe('2026-10-31T16:00:00.000Z')
        expect(w.ytd.to).toEqual(now)
        expect(w.mth.to).toEqual(now)
    })

    it('uses the Manila calendar month near a UTC month boundary', () => {
        // 2026-11-30 17:00 UTC is already 2026-12-01 01:00 in Manila
        const w = resolvePerformanceWindows(
            undefined,
            new Date('2026-11-30T17:00:00.000Z'),
        )
        expect(w.month).toBe('2026-12')
    })

    it('ends a past month at its last Manila millisecond', () => {
        const w = resolvePerformanceWindows('2026-03', now)
        expect(w.mth.from.toISOString()).toBe('2026-02-28T16:00:00.000Z')
        expect(w.mth.to.toISOString()).toBe('2026-03-31T15:59:59.999Z')
        expect(w.ytd.to.toISOString()).toBe('2026-03-31T15:59:59.999Z')
    })

    it('returns an empty month window for a month that has not started', () => {
        const w = resolvePerformanceWindows('2026-12', now)
        expect(w.mth.to.getTime()).toBe(w.mth.from.getTime())
        expect(w.ytd.to).toEqual(now)
    })

    it('rejects a malformed month', () => {
        expect(() => resolvePerformanceWindows('2026-13', now)).toThrow(
            BadRequestException,
        )
    })
})

describe('percentOf', () => {
    it('rounds to two decimals', () => {
        expect(percentOf(1_346_492.97, 14_000_000)).toBe(9.62)
    })
    it('is null without a positive base', () => {
        expect(percentOf(100, 0)).toBeNull()
        expect(percentOf(100, -5)).toBeNull()
    })
})

type QueryKind = 'metrics' | 'locations' | 'tenders' | 'external'

function buildService(options: {
    targets?: Array<{ month: number; salesTarget: number; collectionQuota: number }>
    results: Record<QueryKind, unknown[][]>
}) {
    const calls: Record<QueryKind, number> = {
        metrics: 0,
        locations: 0,
        tenders: 0,
        external: 0,
    }
    const kindOf = (sql: string): QueryKind => {
        if (sql.includes('line_sales')) return 'metrics'
        if (sql.includes('GROUP BY q.kind, q.location')) return 'locations'
        if (sql.includes('sd_sales_order_payments')) return 'tenders'
        return 'external'
    }
    const queryRaw = jest.fn((strings: TemplateStringsArray) => {
        const kind = kindOf(strings.join('?'))
        const index = calls[kind]++
        return Promise.resolve(options.results[kind][index] ?? [])
    })
    const upsert = jest.fn((args: unknown) => Promise.resolve(args))
    const prisma = {
        $queryRaw: queryRaw,
        $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
        sdSalesTarget: {
            findMany: jest.fn(() => Promise.resolve(options.targets ?? [])),
            upsert,
        },
    }
    return {
        service: new SalesPerformanceService(prisma as never),
        prisma,
        calls,
    }
}

describe('SalesPerformanceService.performance', () => {
    const now = new Date('2026-11-19T07:00:00.000Z')
    const metrics = (
        sales: number,
        qty: number,
        lineSales: number,
        costed: number,
        cost: number,
    ) => [{ sales, qty, line_sales: lineSales, costed_sales: costed, cost }]

    it('rolls up YTD vs month targets, GPR, collections and locations', async () => {
        const targets = Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            salesTarget: 1_000_000,
            collectionQuota: 500_000,
        }))
        const { service } = buildService({
            targets,
            results: {
                metrics: [
                    metrics(2_000_000, 3502, 2_000_000, 1_500_000, 1_200_000),
                    metrics(155_135, 267, 155_135, 0, 0),
                ],
                locations: [
                    [
                        { kind: 'BRANCH', location: 'Davao Branch', sales: 1_200_000 },
                        { kind: 'ONLINE', location: 'Shopee', sales: 500_000 },
                        { kind: 'BRANCH', location: 'Tagum Branch', sales: 300_000 },
                    ],
                    [{ kind: 'BRANCH', location: 'Davao Branch', sales: 155_135 }],
                ],
                tenders: [[{ amount: 900_000 }], [{ amount: 40_000 }]],
                external: [[{ amount: 100_000 }], [{ amount: 8_943 }]],
            },
        })

        const result = await service.performance({ month: '2026-11' }, now)

        expect(result.targetsConfigured).toBe(true)
        // YTD = Jan..Nov targets, month = Nov only
        expect(result.ytd.salesTarget).toBe(11_000_000)
        expect(result.ytd.collectionQuota).toBe(5_500_000)
        expect(result.mth.salesTarget).toBe(1_000_000)

        expect(result.ytd.sales).toBe(2_000_000)
        expect(result.ytd.targetPercent).toBe(18.18)
        expect(result.ytd.grossProfitRate).toBe(20) // (1.5M - 1.2M) / 1.5M
        expect(result.ytd.costCoverage).toBe(75)
        expect(result.ytd.collected).toBe(1_000_000)
        expect(result.ytd.quotaPercent).toBe(18.18)
        // Physical branches and online platforms stay distinguishable.
        expect(result.ytd.byLocation).toEqual([
            { kind: 'BRANCH', location: 'Davao Branch', sales: 1_200_000, share: 60 },
            { kind: 'ONLINE', location: 'Shopee', sales: 500_000, share: 25 },
            { kind: 'BRANCH', location: 'Tagum Branch', sales: 300_000, share: 15 },
        ])

        expect(result.mth.qty).toBe(267)
        expect(result.mth.collected).toBe(48_943)
        expect(result.mth.quotaPercent).toBe(9.79)
        // No line has a known cost: GPR cannot be computed, not 100%.
        expect(result.mth.grossProfitRate).toBeNull()
        expect(result.mth.costCoverage).toBe(0)
    })

    it('reports null percentages and unconfigured targets when none are saved', async () => {
        const { service } = buildService({
            results: {
                metrics: [
                    metrics(500, 5, 500, 500, 300),
                    metrics(100, 1, 100, 100, 60),
                ],
                locations: [],
                tenders: [],
                external: [],
            },
        })
        const result = await service.performance({ month: '2026-11' }, now)
        expect(result.targetsConfigured).toBe(false)
        expect(result.ytd.salesTarget).toBe(0)
        expect(result.ytd.targetPercent).toBeNull()
        expect(result.mth.quotaPercent).toBeNull()
        expect(result.mth.grossProfitRate).toBe(40)
        expect(result.ytd.byLocation).toEqual([])
    })

    it('skips tender collections for external platform sales and orders for POS', async () => {
        const external = buildService({
            results: { metrics: [], locations: [], tenders: [], external: [] },
        })
        await external.service.performance({ channel: 'EXTERNAL' }, now)
        expect(external.calls.tenders).toBe(0)
        expect(external.calls.external).toBe(2)

        const pos = buildService({
            results: { metrics: [], locations: [], tenders: [], external: [] },
        })
        await pos.service.performance({ channel: 'POS' }, now)
        expect(pos.calls.tenders).toBe(2)
        expect(pos.calls.external).toBe(0)
    })
})

describe('SalesPerformanceService targets', () => {
    it('returns twelve zero-filled months', async () => {
        const { service } = buildService({
            targets: [{ month: 3, salesTarget: 10, collectionQuota: 4 }],
            results: { metrics: [], locations: [], tenders: [], external: [] },
        })
        const { months } = await service.targets(2026)
        expect(months).toHaveLength(12)
        expect(months[2]).toEqual({ month: 3, salesTarget: 10, collectionQuota: 4 })
        expect(months[0]).toEqual({ month: 1, salesTarget: 0, collectionQuota: 0 })
    })

    it('upserts each month and records who saved it', async () => {
        const { service, prisma } = buildService({
            results: { metrics: [], locations: [], tenders: [], external: [] },
        })
        await service.saveTargets(
            2026,
            [
                { month: 1, salesTarget: 100, collectionQuota: 50 },
                { month: 2, salesTarget: 200, collectionQuota: 80 },
            ],
            'user-1',
        )
        expect(prisma.sdSalesTarget.upsert).toHaveBeenCalledTimes(2)
        expect(prisma.sdSalesTarget.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { year_month: { year: 2026, month: 1 } },
                update: expect.objectContaining({ updatedBy: 'user-1' }),
            }),
        )
    })

    it('rejects duplicate months without writing anything', async () => {
        const { service, prisma } = buildService({
            results: { metrics: [], locations: [], tenders: [], external: [] },
        })
        await expect(
            service.saveTargets(2026, [
                { month: 1, salesTarget: 1, collectionQuota: 1 },
                { month: 1, salesTarget: 2, collectionQuota: 2 },
            ]),
        ).rejects.toThrow(BadRequestException)
        expect(prisma.sdSalesTarget.upsert).not.toHaveBeenCalled()
    })
})
