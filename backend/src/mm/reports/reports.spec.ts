import { ForbiddenException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { Decimal } from '@prisma/client/runtime/library'
import { ReportsService } from './reports.service'
import { StockVarianceReportService } from './stock-variance-report.service'
import { WarehousePerformanceReportService } from './warehouse-performance-report.service'
import { InventoryBalanceQueryService } from '../inventory/inventory-balance-query.service'
import { InventoryValueService } from '../valuation/inventory-value.service'
import { DashboardAnalyticsService } from '../dashboard/dashboard-analytics.service'
import { DashboardVisibilityService } from '../dashboard/dashboard-visibility.service'
import { SupplierPerformanceDashboardService } from '../supplier-performance/supplier-performance-dashboard.service'
import { PrismaService } from '../../prisma/prisma.service'
import {
    assertReportAccess,
    clampLimit,
    MAX_REPORT_LIMIT,
} from './reports.helpers'
import {
    agingBucket,
    computeTurnover,
    parseAgingBuckets,
    resolveAgingBucket,
    resolveVisibility,
} from '../dashboard/dashboard.helpers'

describe('MM-14 Reports & Analytics', () => {
    describe('helpers', () => {
        it('assertReportAccess throws when scope missing', () => {
            const vis = resolveVisibility('user', 'mm.procurement')
            expect(() => assertReportAccess('inventory', vis)).toThrow(
                ForbiddenException,
            )
        })

        it('clampLimit caps at MAX_REPORT_LIMIT', () => {
            expect(clampLimit(500)).toBe(MAX_REPORT_LIMIT)
            expect(clampLimit(undefined)).toBe(50)
        })

        it('parseAgingBuckets supports custom presets', () => {
            const buckets = parseAgingBuckets('0-15|16-30|31+')
            expect(resolveAgingBucket(10, buckets)).toBe('0-15')
            expect(resolveAgingBucket(20, buckets)).toBe('16-30')
            expect(resolveAgingBucket(100, buckets)).toBe('31+')
        })

        it('agingBucket uses default buckets', () => {
            expect(agingBucket(15)).toBe('0-30')
            expect(agingBucket(45)).toBe('31-60')
        })

        it('computeTurnover matches dashboard definition', () => {
            expect(computeTurnover(100, 25)).toBe(4)
        })
    })

    describe('ReportsService', () => {
        let service: ReportsService
        const prisma = {
            mmInventoryBalance: {
                findMany: jest.fn(),
                count: jest.fn(),
                aggregate: jest.fn(),
            },
            warehouse: { findMany: jest.fn() },
        }
        const inventoryValue = {
            queryReadOnly: jest.fn(),
        }
        const analytics = {
            getAnalytics: jest.fn(),
        }
        const supplierDashboard = {
            getDashboard: jest.fn(),
        }
        const varianceReport = {
            query: jest.fn(),
        }
        const warehousePerf = {
            query: jest.fn(),
        }

        beforeEach(async () => {
            jest.clearAllMocks()
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    ReportsService,
                    { provide: PrismaService, useValue: prisma },
                    InventoryBalanceQueryService,
                    { provide: InventoryValueService, useValue: inventoryValue },
                    { provide: DashboardAnalyticsService, useValue: analytics },
                    {
                        provide: SupplierPerformanceDashboardService,
                        useValue: supplierDashboard,
                    },
                    { provide: StockVarianceReportService, useValue: varianceReport },
                    {
                        provide: WarehousePerformanceReportService,
                        useValue: warehousePerf,
                    },
                    DashboardVisibilityService,
                ],
            }).compile()
            service = module.get(ReportsService)
        })

        it('denies stock report without inventory scope', async () => {
            await expect(
                service.getStock({
                    companyId: 'co-1',
                    role: 'user',
                    authority: 'mm.procurement',
                }),
            ).rejects.toThrow(ForbiddenException)
        })

        it('returns stock rows with totals', async () => {
            prisma.mmInventoryBalance.findMany.mockResolvedValue([
                { id: 'b1', quantity: new Decimal(10) },
            ])
            prisma.mmInventoryBalance.count.mockResolvedValue(1)
            prisma.mmInventoryBalance.aggregate.mockResolvedValue({
                _sum: { quantity: new Decimal(10) },
            })

            const result = await service.getStock({ companyId: 'co-1' })
            expect(result.totals.quantity).toBe(10)
            expect(result.meta.total).toBe(1)
        })

        it('uses read-only valuation path', async () => {
            inventoryValue.queryReadOnly.mockResolvedValue({
                data: [],
                meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
                totals: { inventoryValue: 0 },
                readOnly: true,
            })
            await service.getInventoryValuation({ companyId: 'co-1' })
            expect(inventoryValue.queryReadOnly).toHaveBeenCalled()
            expect(inventoryValue.queryReadOnly).not.toHaveProperty(
                'ensureForPosting',
            )
        })

        it('delegates aging to analytics with filters', async () => {
            analytics.getAnalytics.mockResolvedValue({ type: 'AGING', buckets: [] })
            await service.getAging({
                companyId: 'co-1',
                warehouseId: 'wh-1',
                agingBuckets: '0-30|31-60|61-90|90+',
            })
            expect(analytics.getAnalytics).toHaveBeenCalledWith('aging', {
                companyId: 'co-1',
                warehouseId: 'wh-1',
                agingBuckets: '0-30|31-60|61-90|90+',
            })
        })

        it('delegates variance report', async () => {
            varianceReport.query.mockResolvedValue({
                type: 'STOCK_VARIANCE',
                data: [
                    {
                        systemQuantity: 10,
                        countedQuantity: 8,
                        varianceQuantity: -2,
                        varianceValue: -20,
                    },
                ],
                totals: { varianceQuantity: -2, varianceValue: -20 },
            })
            const result = await service.getStockVariance({ companyId: 'co-1' })
            expect(result.data[0].varianceQuantity).toBe(-2)
        })
    })

    describe('StockVarianceReportService', () => {
        it('paginates and sums variance totals', async () => {
            const prismaMock = {
                mmInventoryCountLine: {
                    findMany: jest.fn().mockResolvedValue([]),
                    count: jest.fn().mockResolvedValue(0),
                    aggregate: jest.fn().mockResolvedValue({
                        _sum: { varianceQuantity: 0, varianceValue: 0 },
                    }),
                },
            }
            const svc = new StockVarianceReportService(prismaMock as any)
            const result = await svc.query({ companyId: 'co-1', limit: 250 })
            expect(result.meta.limit).toBe(MAX_REPORT_LIMIT)
        })
    })
})
