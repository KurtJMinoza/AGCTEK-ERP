import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ReportsService } from '../reports/reports.service'
import { DashboardAnalyticsService } from '../dashboard/dashboard-analytics.service'
import {
    DashboardFilters,
    buildCacheKey,
    isCacheFresh,
    CACHE_TTL_MS,
} from '../dashboard/dashboard.helpers'
import { AnalyticsQueryDto } from './dto/analytics.dto'
import { ReportsQueryDto } from '../reports/dto/reports.dto'

/**
 * Read-only MM analytics facade.
 * Delegates heavy aggregates to reports / dashboard cache; never posts inventory.
 */
@Injectable()
export class AnalyticsService {
    constructor(
        private prisma: PrismaService,
        private reports: ReportsService,
        private dashboardAnalytics: DashboardAnalyticsService,
    ) {}

    private toFilters(q: AnalyticsQueryDto): DashboardFilters {
        return {
            companyId: q.companyId,
            warehouseId: q.warehouseId,
            branchId: q.branchId,
            materialCategoryId: q.materialCategoryId,
            supplierId: q.supplierId,
            dateFrom: q.dateFrom,
            dateTo: q.dateTo,
            deadStockDays: q.deadStockDays,
            agingBuckets: q.agingBuckets,
        }
    }

    private toReportsQuery(q: AnalyticsQueryDto): ReportsQueryDto {
        return {
            companyId: q.companyId,
            warehouseId: q.warehouseId,
            branchId: q.branchId,
            materialCategoryId: q.materialCategoryId,
            supplierId: q.supplierId,
            dateFrom: q.dateFrom,
            dateTo: q.dateTo,
            deadStockDays: q.deadStockDays,
            agingBuckets: q.agingBuckets,
            page: q.page,
            limit: q.limit,
            role: q.role,
            authority: q.authority,
        } as ReportsQueryDto
    }

    async getInventory(query: AnalyticsQueryDto) {
        return this.cached('INVENTORY', this.toFilters(query), async () => {
            const filters = this.toFilters(query)
            const reportsQ = this.toReportsQuery(query)
            const [aging, turnover, deadStock, availability, shortage, expiry] =
                await Promise.all([
                    this.dashboardAnalytics.getAnalytics('aging', filters),
                    this.dashboardAnalytics.getAnalytics('turnover', filters),
                    this.dashboardAnalytics.getAnalytics('dead-stock', filters),
                    this.computeAvailability(query),
                    this.computeShortages(query),
                    this.computeExpiryRisk(query),
                ])
            return {
                type: 'INVENTORY',
                filters,
                aging,
                turnover,
                deadStock,
                availability,
                shortage,
                expiry,
                drillDown: {
                    stock: '/modules/mm/inventory-management/stock-overview',
                    shortages: '/modules/mm/planning-mrp/shortage-monitor',
                    expiry: '/modules/mm/returns-disposal/damaged-stock',
                    valuation: '/modules/mm/reports-analytics/inventory-valuation-reports',
                },
                // keep reports query shape available for consumers
                reportsScope: {
                    companyId: reportsQ.companyId,
                    warehouseId: reportsQ.warehouseId,
                },
            }
        })
    }

    async getProcurement(query: AnalyticsQueryDto) {
        return this.cached('PROCUREMENT', this.toFilters(query), async () => {
            const filters = this.toFilters(query)
            const [spend, procurement, cycleTime, overduePos] = await Promise.all([
                this.dashboardAnalytics.getAnalytics('spend', filters),
                this.dashboardAnalytics.getAnalytics('procurement', filters),
                this.computeProcurementCycleTime(query),
                this.countOverduePos(query),
            ])
            return {
                type: 'PROCUREMENT',
                filters,
                spend,
                procurement,
                cycleTime,
                overduePos,
                drillDown: {
                    purchaseOrders: '/modules/mm/procurement/purchase-orders',
                    overdue: '/modules/mm/procurement/purchase-orders?filter=overdue',
                },
            }
        })
    }

    async getWarehouse(query: AnalyticsQueryDto) {
        return this.cached('WAREHOUSE', this.toFilters(query), async () => {
            const warehousePerf = await this.reports.getWarehousePerformance(
                this.toReportsQuery(query),
            )
            const pickingAccuracy = await this.computePickingAccuracy(query)
            return {
                type: 'WAREHOUSE',
                filters: this.toFilters(query),
                performance: warehousePerf,
                pickingAccuracy,
                drillDown: {
                    putaway: '/modules/mm/warehouse-management/putaway',
                    picking: '/modules/mm/warehouse-management/picking',
                },
            }
        })
    }

    async getQuality(query: AnalyticsQueryDto) {
        return this.cached('QUALITY', this.toFilters(query), async () => {
            const [receivingAccuracy, qi] = await Promise.all([
                this.computeReceivingAccuracy(query),
                this.computeQualityInspectionStats(query),
            ])
            return {
                type: 'QUALITY',
                filters: this.toFilters(query),
                receivingAccuracy,
                qualityInspection: qi,
                drillDown: {
                    inspection: '/modules/mm/receiving/receiving-inspection',
                    variances: '/modules/mm/receiving/receiving-variances',
                },
            }
        })
    }

    async getValuation(query: AnalyticsQueryDto) {
        return this.cached('VALUATION', this.toFilters(query), async () => {
            const [valuation, variance] = await Promise.all([
                this.reports.getInventoryValuation(this.toReportsQuery(query)),
                this.reports.getStockVariance(this.toReportsQuery(query)),
            ])
            return {
                type: 'VALUATION',
                filters: this.toFilters(query),
                valuation,
                stockVariance: variance,
                readOnly: true,
                drillDown: {
                    valuation: '/modules/mm/reports-analytics/inventory-valuation-reports',
                    variance: '/modules/mm/inventory-control/variance-analysis',
                },
            }
        })
    }

    private async cached(
        metricType: string,
        filters: DashboardFilters,
        compute: () => Promise<Record<string, any>>,
    ) {
        const cacheKey = buildCacheKey(metricType, filters)
        const cached = await this.prisma.mmDashboardAnalyticsCache.findUnique({
            where: { cacheKey },
        })
        if (cached && isCacheFresh(cached.expiresAt)) {
            return {
                ...((cached.payload as any) ?? {}),
                cached: true,
                computedAt: cached.computedAt,
            }
        }
        const payload = await compute()
        const now = new Date()
        await this.prisma.mmDashboardAnalyticsCache.upsert({
            where: { cacheKey },
            update: {
                payload,
                computedAt: now,
                expiresAt: new Date(now.getTime() + CACHE_TTL_MS),
                metricType,
            },
            create: {
                companyId: filters.companyId,
                cacheKey,
                metricType,
                payload,
                computedAt: now,
                expiresAt: new Date(now.getTime() + CACHE_TTL_MS),
            },
        })
        return { ...payload, cached: false, computedAt: now }
    }

    private async computeAvailability(query: AnalyticsQueryDto) {
        const where: any = {
            companyId: query.companyId,
            ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
            ...(query.materialCategoryId
                ? { material: { materialCategoryId: query.materialCategoryId } }
                : {}),
        }
        const agg = await this.prisma.mmInventoryBalance.aggregate({
            where,
            _sum: {
                quantity: true,
                availableQuantity: true,
                reservedQuantity: true,
            },
            _count: { id: true },
        })
        return {
            balanceLines: agg._count.id,
            onHand: Number(agg._sum.quantity ?? 0),
            available: Number(agg._sum.availableQuantity ?? 0),
            reserved: Number(agg._sum.reservedQuantity ?? 0),
            href: '/modules/mm/inventory-management/available-stock',
        }
    }

    private async computeShortages(query: AnalyticsQueryDto) {
        const where: any = {
            companyId: query.companyId,
            shortage: true,
            ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        }
        const [count, sample] = await Promise.all([
            this.prisma.mmMaterialRequirement.count({ where }),
            this.prisma.mmMaterialRequirement.findMany({
                where,
                take: 20,
                orderBy: { shortageQty: 'desc' },
                select: {
                    id: true,
                    materialId: true,
                    shortageQty: true,
                    availableQty: true,
                    material: {
                        select: { materialCode: true, materialName: true },
                    },
                },
            }),
        ])
        return {
            count,
            sample,
            href: '/modules/mm/planning-mrp/shortage-monitor',
        }
    }

    private async computeExpiryRisk(query: AnalyticsQueryDto) {
        const horizonDays = query.expiryDays ?? 30
        const now = new Date()
        const horizon = new Date(now.getTime() + horizonDays * 86400000)

        const balances = await this.prisma.mmInventoryBalance.findMany({
            where: {
                companyId: query.companyId,
                quantity: { gt: 0 },
                ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
                batchId: { not: null },
                OR: [
                    { stockStatus: 'EXPIRED' },
                    { batch: { expiryDate: { lte: horizon } } },
                ],
            },
            include: {
                batch: { select: { id: true, batchNumber: true, expiryDate: true } },
                material: {
                    select: { id: true, materialCode: true, materialName: true },
                },
            },
            take: 200,
        })

        let expired = 0
        let nearExpiry = 0
        const rows = balances.map((b) => {
            const expiry = b.batch?.expiryDate ?? null
            const daysRemaining =
                expiry != null
                    ? Math.ceil((expiry.getTime() - now.getTime()) / 86400000)
                    : null
            const isExpired =
                b.stockStatus === 'EXPIRED' ||
                (daysRemaining != null && daysRemaining < 0)
            if (isExpired) expired++
            else if (daysRemaining != null && daysRemaining <= horizonDays) {
                nearExpiry++
            }
            return {
                balanceId: b.id,
                materialCode: b.material.materialCode,
                materialName: b.material.materialName,
                batchNumber: b.batch?.batchNumber ?? null,
                quantity: Number(b.quantity),
                expiryDate: expiry,
                daysRemaining,
                isExpired,
            }
        })

        return {
            horizonDays,
            expiredCount: expired,
            nearExpiryCount: nearExpiry,
            rows,
            href: '/modules/mm/returns-disposal/damaged-stock',
        }
    }

    private async computeProcurementCycleTime(query: AnalyticsQueryDto) {
        const from = query.dateFrom
            ? new Date(query.dateFrom)
            : new Date(Date.now() - 90 * 86400000)
        const to = query.dateTo ? new Date(query.dateTo) : new Date()

        const pos = await this.prisma.mmPurchaseOrder.findMany({
            where: {
                companyId: query.companyId,
                status: { notIn: ['CANCELLED', 'DRAFT'] },
                createdAt: { gte: from, lte: to },
                ...(query.supplierId ? { supplierId: query.supplierId } : {}),
                ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
            },
            select: {
                id: true,
                createdAt: true,
                purchaseRequisitionId: true,
                purchaseRequisition: { select: { createdAt: true } },
                goodsReceipts: {
                    where: { status: 'POSTED' },
                    orderBy: { postingDate: 'asc' },
                    take: 1,
                    select: { postingDate: true },
                },
            },
            take: 500,
        })

        const prToPo: number[] = []
        const poToGr: number[] = []
        const prToGr: number[] = []

        for (const po of pos) {
            const prAt = po.purchaseRequisition?.createdAt
            if (prAt) {
                prToPo.push(
                    Math.max(0, (po.createdAt.getTime() - prAt.getTime()) / 86400000),
                )
            }
            const firstGr = po.goodsReceipts[0]?.postingDate
            if (firstGr) {
                poToGr.push(
                    Math.max(
                        0,
                        (firstGr.getTime() - po.createdAt.getTime()) / 86400000,
                    ),
                )
                if (prAt) {
                    prToGr.push(
                        Math.max(0, (firstGr.getTime() - prAt.getTime()) / 86400000),
                    )
                }
            }
        }

        const avg = (xs: number[]) =>
            xs.length
                ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2))
                : 0
        const median = (xs: number[]) => {
            if (!xs.length) return 0
            const s = [...xs].sort((a, b) => a - b)
            const mid = Math.floor(s.length / 2)
            return s.length % 2 ? s[mid] : Number(((s[mid - 1] + s[mid]) / 2).toFixed(2))
        }

        return {
            sampleSize: pos.length,
            prToPoDays: { avg: avg(prToPo), median: median(prToPo), n: prToPo.length },
            poToFirstGrDays: {
                avg: avg(poToGr),
                median: median(poToGr),
                n: poToGr.length,
            },
            prToFirstGrDays: {
                avg: avg(prToGr),
                median: median(prToGr),
                n: prToGr.length,
            },
            period: { from, to },
        }
    }

    private async countOverduePos(query: AnalyticsQueryDto) {
        const now = new Date()
        return this.prisma.mmPurchaseOrder.count({
            where: {
                companyId: query.companyId,
                status: { in: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'] },
                expectedDeliveryDate: { lt: now },
                ...(query.supplierId ? { supplierId: query.supplierId } : {}),
                ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
            },
        })
    }

    private async computeReceivingAccuracy(query: AnalyticsQueryDto) {
        const from = query.dateFrom
            ? new Date(query.dateFrom)
            : new Date(Date.now() - 30 * 86400000)
        const to = query.dateTo ? new Date(query.dateTo) : new Date()

        const lines = await this.prisma.mmGoodsReceiptLine.findMany({
            where: {
                receipt: {
                    companyId: query.companyId,
                    status: 'POSTED',
                    postingDate: { gte: from, lte: to },
                    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
                    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
                },
            },
            select: {
                quantity: true,
                shortageQuantity: true,
                overageQuantity: true,
                damagedQuantity: true,
                rejectedQuantity: true,
                discrepancyFlag: true,
                purchaseOrderLine: { select: { quantity: true } },
            },
            take: 5000,
        })

        let expected = 0
        let received = 0
        let varianceLines = 0
        for (const l of lines) {
            const ordered = Number(l.purchaseOrderLine?.quantity ?? l.quantity)
            const qty = Number(l.quantity)
            expected += ordered
            received += qty
            if (
                Number(l.shortageQuantity || 0) > 0 ||
                Number(l.overageQuantity || 0) > 0 ||
                Number(l.damagedQuantity || 0) > 0 ||
                Number(l.rejectedQuantity || 0) > 0 ||
                l.discrepancyFlag
            ) {
                varianceLines++
            }
        }
        const accuracyRate =
            expected > 0
                ? Math.max(0, 1 - Math.abs(received - expected) / expected)
                : lines.length
                  ? 1 - varianceLines / lines.length
                  : 0

        return {
            lineCount: lines.length,
            expectedQty: expected,
            receivedQty: received,
            varianceLines,
            varianceRate: lines.length ? varianceLines / lines.length : 0,
            accuracyRate,
            period: { from, to },
        }
    }

    private async computePickingAccuracy(query: AnalyticsQueryDto) {
        const from = query.dateFrom
            ? new Date(query.dateFrom)
            : new Date(Date.now() - 30 * 86400000)
        const to = query.dateTo ? new Date(query.dateTo) : new Date()

        const tasks = await this.prisma.wmPickingTask.findMany({
            where: {
                status: 'COMPLETED',
                completedAt: { gte: from, lte: to },
                ...(query.warehouseId
                    ? { warehouseId: query.warehouseId }
                    : { warehouse: { companyId: query.companyId } }),
            },
            select: {
                requiredQty: true,
                pickedQty: true,
            },
            take: 5000,
        })

        let exact = 0
        let short = 0
        let over = 0
        for (const t of tasks) {
            const req = Number(t.requiredQty)
            const picked = Number(t.pickedQty)
            if (picked === req) exact++
            else if (picked < req) short++
            else over++
        }
        const total = tasks.length
        return {
            taskCount: total,
            exact,
            short,
            over,
            accuracyRate: total ? exact / total : 0,
            shortRate: total ? short / total : 0,
            overRate: total ? over / total : 0,
            period: { from, to },
        }
    }

    private async computeQualityInspectionStats(query: AnalyticsQueryDto) {
        const from = query.dateFrom
            ? new Date(query.dateFrom)
            : new Date(Date.now() - 30 * 86400000)
        const to = query.dateTo ? new Date(query.dateTo) : new Date()

        const lots = await this.prisma.mmQualityInspection.findMany({
            where: {
                companyId: query.companyId,
                createdAt: { gte: from, lte: to },
                ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
                ...(query.supplierId
                    ? { goodsReceipt: { supplierId: query.supplierId } }
                    : {}),
            },
            include: { lines: true },
            take: 2000,
        })

        let received = 0
        let accepted = 0
        let rejected = 0
        let pending = 0
        for (const lot of lots) {
            if (lot.status === 'PENDING') pending++
            for (const l of lot.lines) {
                received += Number(l.quantity)
                accepted += Number(l.passQuantity || 0)
                rejected += Number(l.failQuantity || 0)
            }
        }
        return {
            lotCount: lots.length,
            pending,
            receivedQty: received,
            acceptedQty: accepted,
            rejectedQty: rejected,
            acceptanceRate: received > 0 ? accepted / received : 0,
            rejectionRate: received > 0 ? rejected / received : 0,
            period: { from, to },
        }
    }
}
