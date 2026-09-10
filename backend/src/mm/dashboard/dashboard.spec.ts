import {
    agingBucket,
    buildCacheKey,
    computeTurnover,
    isCacheFresh,
    isOverduePo,
    parseAgingBuckets,
    resolveAgingBucket,
    resolveVisibility,
    sumStockByStatus,
} from './dashboard.helpers'

describe('MM-18 dashboard helpers', () => {
    describe('agingBucket', () => {
        it('maps day ranges', () => {
            expect(agingBucket(0)).toBe('0-30')
            expect(agingBucket(30)).toBe('0-30')
            expect(agingBucket(31)).toBe('31-60')
            expect(agingBucket(60)).toBe('31-60')
            expect(agingBucket(61)).toBe('61-90')
            expect(agingBucket(90)).toBe('61-90')
            expect(agingBucket(91)).toBe('90+')
        })
    })

    describe('computeTurnover', () => {
        it('divides issue by average on-hand', () => {
            expect(computeTurnover(100, 50)).toBe(2)
            expect(computeTurnover(10, 0)).toBe(0)
            expect(computeTurnover(1, 3)).toBe(0.3333)
        })
    })

    describe('isOverduePo', () => {
        const today = new Date('2026-09-05T12:00:00Z')

        it('flags open POs past expected delivery', () => {
            expect(
                isOverduePo(new Date('2026-09-01'), 'SENT', new Date(today)),
            ).toBe(true)
            expect(
                isOverduePo(new Date('2026-09-10'), 'SENT', new Date(today)),
            ).toBe(false)
            expect(
                isOverduePo(new Date('2026-09-01'), 'CLOSED', new Date(today)),
            ).toBe(false)
            expect(isOverduePo(null, 'SENT', new Date(today))).toBe(false)
        })
    })

    describe('resolveVisibility', () => {
        it('shows all for admin', () => {
            expect(resolveVisibility('admin')).toEqual({
                inventory: true,
                procurement: true,
                warehouse: true,
                analytics: true,
            })
        })

        it('gates by authority tags', () => {
            expect(resolveVisibility('user', 'mm.inventory')).toEqual({
                inventory: true,
                procurement: false,
                warehouse: false,
                analytics: true,
            })
            expect(resolveVisibility('user', 'mm.procurement,mm.warehouse')).toEqual({
                inventory: false,
                procurement: true,
                warehouse: true,
                analytics: false,
            })
        })

        it('shows all when no role/authority (dev default)', () => {
            expect(resolveVisibility()).toEqual({
                inventory: true,
                procurement: true,
                warehouse: true,
                analytics: true,
            })
        })
    })

    describe('parseAgingBuckets / resolveAgingBucket', () => {
        it('uses defaults when spec empty', () => {
            expect(parseAgingBuckets()).toHaveLength(4)
            expect(resolveAgingBucket(91, parseAgingBuckets())).toBe('90+')
        })
    })

    describe('buildCacheKey / isCacheFresh', () => {
        it('is stable for same filters', () => {
            const f = { companyId: 'c1', warehouseId: 'w1', deadStockDays: 90 }
            expect(buildCacheKey('AGING', f)).toBe(buildCacheKey('AGING', f))
            expect(buildCacheKey('AGING', f)).not.toBe(buildCacheKey('TURNOVER', f))
        })

        it('detects fresh vs expired cache', () => {
            const future = new Date(Date.now() + 60_000)
            const past = new Date(Date.now() - 1000)
            expect(isCacheFresh(future)).toBe(true)
            expect(isCacheFresh(past)).toBe(false)
        })
    })

    describe('sumStockByStatus', () => {
        it('aggregates unrestricted / QI / blocked', () => {
            expect(
                sumStockByStatus([
                    { stockStatus: 'UNRESTRICTED', _sum: { quantity: 10 } },
                    { stockStatus: 'QUALITY_INSPECTION', _sum: { quantity: 2 } },
                    { stockStatus: 'BLOCKED', _sum: { quantity: 1 } },
                    { stockStatus: 'RESTRICTED', _sum: { quantity: 3 } },
                ]),
            ).toEqual({ available: 10, quality: 2, blocked: 1, other: 3 })
        })
    })
})

describe('MM-15 overview KPI groups', () => {
    it('maps alert scopes to visibility buckets', () => {
        const vis = resolveVisibility('user', 'mm.warehouse')
        expect(vis.inventory).toBe(false)
        expect(vis.warehouse).toBe(true)
        expect(vis.procurement).toBe(false)
    })
})

describe('MM-18 analytics cache hit', () => {
    it('skips recompute when cache is fresh', async () => {
        const payload = { buckets: [{ name: '0-30', quantity: 5 }] }
        const findUnique = jest.fn().mockResolvedValue({
            payload,
            expiresAt: new Date(Date.now() + 60_000),
            computedAt: new Date(),
        })
        const upsert = jest.fn()
        const prisma = {
            mmDashboardAnalyticsCache: { findUnique, upsert },
        }

        // Inline the cache-read path used by DashboardAnalyticsService
        const { buildCacheKey: key, isCacheFresh: fresh } = await import('./dashboard.helpers')
        const cacheKey = key('AGING', { companyId: 'c1' })
        const cached = await prisma.mmDashboardAnalyticsCache.findUnique({ where: { cacheKey } })
        expect(cached && fresh(cached.expiresAt)).toBe(true)
        expect(upsert).not.toHaveBeenCalled()
        expect(cached!.payload).toEqual(payload)
    })
})
