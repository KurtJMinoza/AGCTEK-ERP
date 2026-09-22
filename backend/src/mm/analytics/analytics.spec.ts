import { readFileSync } from 'fs'
import { join } from 'path'
import { AnalyticsService } from './analytics.service'
import { buildCacheKey } from '../dashboard/dashboard.helpers'
import { QualityMetricsService } from '../quality/quality-metrics.service'

const mockQualityMetrics = {
    getDefectTrend: jest.fn().mockResolvedValue({ buckets: [], topDefects: [], period: {} }),
    getSupplierQualityMetrics: jest.fn().mockResolvedValue([]),
    getMaterialQualityMetrics: jest.fn().mockResolvedValue([]),
    getQualityHoldAging: jest.fn().mockResolvedValue({ activeCount: 0, buckets: {}, releasedCount: 0, avgHoldDurationHours: 0 }),
    getInspectionTurnaround: jest.fn().mockResolvedValue({ sampleSize: 0, avgHours: 0, medianHours: 0, p90Hours: 0, byPriority: {} }),
    getNonconformanceMetric: jest.fn().mockResolvedValue({ total: 0, byStatus: {}, bySeverity: {}, openCount: 0, resolvedCount: 0, avgResolutionDays: 0, openCapaCount: 0, period: {} }),
} as unknown as QualityMetricsService

describe('MM-14 analytics facade', () => {
    const filters = {
        companyId: 'co-1',
        warehouseId: 'wh-1',
        supplierId: 'sup-1',
        dateFrom: '2026-08-01',
        dateTo: '2026-09-01',
    }

    it('does not import InventoryPostingService (read-only)', () => {
        const src = readFileSync(
            join(__dirname, 'analytics.service.ts'),
            'utf8',
        )
        expect(src).not.toMatch(/InventoryPostingService/)
        expect(src).not.toMatch(/inventory-posting/)
    })

    it('propagates company/warehouse/supplier/date filters into cache key', () => {
        const a = buildCacheKey('INVENTORY', filters)
        const b = buildCacheKey('INVENTORY', { ...filters, warehouseId: 'wh-2' })
        const c = buildCacheKey('PROCUREMENT', filters)
        expect(a).toBe(buildCacheKey('INVENTORY', filters))
        expect(a).not.toBe(b)
        expect(a).not.toBe(c)
    })

    it('uses cache hit path without recompute', async () => {
        const payload = {
            type: 'INVENTORY',
            availability: { available: 10 },
        }
        const findUnique = jest.fn().mockResolvedValue({
            payload,
            expiresAt: new Date(Date.now() + 60_000),
            computedAt: new Date(),
        })
        const upsert = jest.fn()
        const prisma: any = {
            mmDashboardAnalyticsCache: { findUnique, upsert },
        }
        const reports: any = {}
        const dashboardAnalytics: any = {
            getAnalytics: jest.fn(),
        }
        const service = new AnalyticsService(prisma, reports, dashboardAnalytics, mockQualityMetrics)

        const result = await service.getInventory(filters as any)
        expect(result.cached).toBe(true)
        expect(result.availability.available).toBe(10)
        expect(upsert).not.toHaveBeenCalled()
        expect(dashboardAnalytics.getAnalytics).not.toHaveBeenCalled()
    })

    it('inventory facade computes on cache miss and writes cache', async () => {
        const findUnique = jest.fn().mockResolvedValue(null)
        const upsert = jest.fn().mockResolvedValue({})
        const prisma: any = {
            mmDashboardAnalyticsCache: { findUnique, upsert },
            mmInventoryBalance: {
                aggregate: jest.fn().mockResolvedValue({
                    _sum: { quantity: 5, availableQuantity: 4, reservedQuantity: 1 },
                    _count: { id: 2 },
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            mmMaterialRequirement: {
                count: jest.fn().mockResolvedValue(1),
                findMany: jest.fn().mockResolvedValue([]),
            },
        }
        const reports: any = {}
        const dashboardAnalytics: any = {
            getAnalytics: jest.fn().mockResolvedValue({ ok: true }),
        }
        const service = new AnalyticsService(prisma, reports, dashboardAnalytics, mockQualityMetrics)
        const result = await service.getInventory({ companyId: 'co-1' } as any)
        expect(result.cached).toBe(false)
        expect(result.type).toBe('INVENTORY')
        expect(result.availability.onHand).toBe(5)
        expect(result.shortage.count).toBe(1)
        expect(upsert).toHaveBeenCalled()
        expect(dashboardAnalytics.getAnalytics).toHaveBeenCalledWith(
            'aging',
            expect.objectContaining({ companyId: 'co-1' }),
        )
    })

    it('procurement facade returns cycle time + overdue', async () => {
        const findUnique = jest.fn().mockResolvedValue(null)
        const upsert = jest.fn().mockResolvedValue({})
        const prisma: any = {
            mmDashboardAnalyticsCache: { findUnique, upsert },
            mmPurchaseOrder: {
                findMany: jest.fn().mockResolvedValue([]),
                count: jest.fn().mockResolvedValue(3),
            },
        }
        const dashboardAnalytics: any = {
            getAnalytics: jest.fn().mockResolvedValue({ spend: 1 }),
        }
        const service = new AnalyticsService(prisma, {} as any, dashboardAnalytics, mockQualityMetrics)
        const result = await service.getProcurement({ companyId: 'co-1' } as any)
        expect(result.type).toBe('PROCUREMENT')
        expect(result.overduePos).toBe(3)
        expect(result.cycleTime.sampleSize).toBe(0)
        expect(result.drillDown.overdue).toContain('purchase-orders')
    })

    it('warehouse facade includes picking accuracy', async () => {
        const findUnique = jest.fn().mockResolvedValue(null)
        const upsert = jest.fn().mockResolvedValue({})
        const prisma: any = {
            mmDashboardAnalyticsCache: { findUnique, upsert },
            wmPickingTask: {
                findMany: jest.fn().mockResolvedValue([
                    { requiredQty: 10, pickedQty: 10 },
                    { requiredQty: 5, pickedQty: 4 },
                ]),
            },
        }
        const reports: any = {
            getWarehousePerformance: jest.fn().mockResolvedValue({ putaway: 1 }),
        }
        const service = new AnalyticsService(prisma, reports, {} as any, mockQualityMetrics)
        const result = await service.getWarehouse({ companyId: 'co-1' } as any)
        expect(result.pickingAccuracy.taskCount).toBe(2)
        expect(result.pickingAccuracy.exact).toBe(1)
        expect(result.pickingAccuracy.short).toBe(1)
        expect(result.pickingAccuracy.accuracyRate).toBe(0.5)
    })

    it('quality facade includes receiving accuracy and Phase 1C metrics', async () => {
        const findUnique = jest.fn().mockResolvedValue(null)
        const upsert = jest.fn().mockResolvedValue({})
        const prisma: any = {
            mmDashboardAnalyticsCache: { findUnique, upsert },
            mmGoodsReceiptLine: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        quantity: 100,
                        shortageQuantity: 0,
                        overageQuantity: 0,
                        damagedQuantity: 0,
                        rejectedQuantity: 0,
                        discrepancyFlag: null,
                        purchaseOrderLine: { quantity: 100 },
                    },
                ]),
            },
            mmInspectionLot: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        quantity: 100,
                        status: 'DECIDED',
                        result: 'PASS',
                        decisions: [
                            { decisionCode: 'ACCEPT', quantity: 95, decidedAt: new Date() },
                            { decisionCode: 'BLOCK', quantity: 5, decidedAt: new Date() },
                        ],
                    },
                ]),
            },
            mmQualityDecision: {
                findMany: jest.fn().mockResolvedValue([
                    { decisionCode: 'ACCEPT', quantity: 95 },
                    { decisionCode: 'BLOCK', quantity: 5 },
                ]),
            },
            mmQualityHold: { count: jest.fn().mockResolvedValue(0) },
            mmNonconformance: { count: jest.fn().mockResolvedValue(0) },
        }
        const service = new AnalyticsService(prisma, {} as any, {} as any, mockQualityMetrics)
        const result = await service.getQuality({ companyId: 'co-1' } as any)
        expect(result.receivingAccuracy.accuracyRate).toBe(1)
        expect(result.qualityInspection.acceptanceRate).toBeCloseTo(0.95)
        expect(result.qualityInspection.rejectionRate).toBeCloseTo(0.05)
        expect(result.readOnly).toBe(true)
        expect(result).toHaveProperty('defectTrend')
        expect(result).toHaveProperty('supplierQualityMetric')
        expect(result).toHaveProperty('materialQualityMetric')
        expect(result).toHaveProperty('qualityHoldAging')
        expect(result).toHaveProperty('inspectionTurnaround')
        expect(result).toHaveProperty('nonconformanceMetric')
        expect(result.drillDown.qualityAnalytics).toContain('quality-analytics')
    })

    it('valuation facade stays read-only and delegates to reports', async () => {
        const findUnique = jest.fn().mockResolvedValue(null)
        const upsert = jest.fn().mockResolvedValue({})
        const prisma: any = {
            mmDashboardAnalyticsCache: { findUnique, upsert },
        }
        const reports: any = {
            getInventoryValuation: jest.fn().mockResolvedValue({ readOnly: true }),
            getStockVariance: jest.fn().mockResolvedValue({ data: [] }),
        }
        const service = new AnalyticsService(prisma, reports, {} as any, mockQualityMetrics)
        const result = await service.getValuation({
            companyId: 'co-1',
            warehouseId: 'wh-1',
        } as any)
        expect(result.readOnly).toBe(true)
        expect(reports.getInventoryValuation).toHaveBeenCalledWith(
            expect.objectContaining({ companyId: 'co-1', warehouseId: 'wh-1' }),
        )
        expect(reports.getStockVariance).toHaveBeenCalled()
    })
})
