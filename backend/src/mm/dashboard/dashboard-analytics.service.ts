import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
    DashboardFilters,
    buildCacheKey,
    isCacheFresh,
    computeTurnover,
    CACHE_TTL_MS,
    parseAgingBuckets,
    resolveAgingBucket,
} from './dashboard.helpers'
import { Prisma } from '@prisma/client'

@Injectable()
export class DashboardAnalyticsService {
    constructor(private prisma: PrismaService) {}

    async getAnalytics(
        type: string,
        filters: DashboardFilters,
        forceRefresh = false,
    ): Promise<Record<string, any>> {
        const metricType = this.toMetricType(type)
        const cacheKey = buildCacheKey(metricType, filters)

        if (!forceRefresh) {
            const cached = await this.prisma.mmDashboardAnalyticsCache.findUnique({
                where: { cacheKey },
            })
            if (cached && isCacheFresh(cached.expiresAt)) {
                return { ...((cached.payload as any) ?? {}), cached: true, computedAt: cached.computedAt }
            }
        }

        const payload: Record<string, any> = await this.compute(metricType, filters)
        const now = new Date()
        await this.prisma.mmDashboardAnalyticsCache.upsert({
            where: { cacheKey },
            update: {
                payload,
                computedAt: now,
                expiresAt: new Date(now.getTime() + CACHE_TTL_MS),
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

    async getSummaries(filters: DashboardFilters): Promise<Record<string, any>> {
        const [aging, turnover, deadStock, movement, spend, suppliers] =
            await Promise.all([
                this.getAnalytics('aging', filters),
                this.getAnalytics('turnover', filters),
                this.getAnalytics('dead-stock', filters),
                this.getAnalytics('movement', filters),
                this.getAnalytics('spend', filters),
                this.getAnalytics('suppliers', filters),
            ])
        return { aging, turnover, deadStock, movement, spend, suppliers }
    }

    async refresh(filters: DashboardFilters) {
        const types = [
            'AGING',
            'TURNOVER',
            'DEAD_STOCK',
            'MOVEMENT',
            'PROCUREMENT_SPEND',
            'PROCUREMENT',
            'SUPPLIERS',
            'FULL_DASHBOARD',
            'INVENTORY',
            'WAREHOUSE',
            'QUALITY',
            'VALUATION',
            'EXPIRY',
            'AVAILABILITY',
        ]
        for (const metricType of types) {
            const cacheKey = buildCacheKey(metricType, filters)
            await this.prisma.mmDashboardAnalyticsCache.deleteMany({
                where: { cacheKey },
            })
        }
        return this.getSummaries(filters)
    }

    private toMetricType(type: string): string {
        const map: Record<string, string> = {
            aging: 'AGING',
            turnover: 'TURNOVER',
            'dead-stock': 'DEAD_STOCK',
            movement: 'MOVEMENT',
            spend: 'PROCUREMENT_SPEND',
            procurement: 'PROCUREMENT',
            suppliers: 'SUPPLIERS',
            full: 'FULL_DASHBOARD',
        }
        const m = map[type]
        if (!m) throw new BadRequestException(`Unknown analytics type: ${type}`)
        return m
    }

    private async compute(metricType: string, filters: DashboardFilters): Promise<Record<string, any>> {
        switch (metricType) {
            case 'AGING':
                return this.computeAging(filters)
            case 'TURNOVER':
                return this.computeTurnoverMetric(filters)
            case 'DEAD_STOCK':
                return this.computeDeadStock(filters)
            case 'MOVEMENT':
                return this.computeMovement(filters)
            case 'PROCUREMENT_SPEND':
                return this.computeSpend(filters)
            case 'PROCUREMENT':
                return this.computeProcurement(filters)
            case 'SUPPLIERS':
                return this.computeSuppliers(filters)
            case 'FULL_DASHBOARD':
                return { type: 'FULL_DASHBOARD', note: 'use getSummaries' }
            default:
                throw new BadRequestException(`Unknown metric: ${metricType}`)
        }
    }

    private async computeAging(filters: DashboardFilters) {
        const bucketsDef = parseAgingBuckets(filters.agingBuckets)
        const warehouseFilter = filters.warehouseId
            ? Prisma.sql`AND b."warehouseId" = ${filters.warehouseId}`
            : Prisma.empty

        const rows = await this.prisma.$queryRaw<
            { materialId: string; warehouseId: string; qty: number; lastInbound: Date | null }[]
        >`
            SELECT b."materialId", b."warehouseId",
                   SUM(b.quantity)::float AS qty,
                   MAX(t."postingDate") AS "lastInbound"
            FROM mm_inventory_balances b
            LEFT JOIN mm_inventory_transactions t
              ON t."materialId" = b."materialId"
             AND t."warehouseId" = b."warehouseId"
             AND t."companyId" = b."companyId"
             AND t."movementType" IN ('RECEIPT', 'TRANSFER_IN', 'RETURN_IN')
            WHERE b."companyId" = ${filters.companyId}
              AND b.quantity > 0
              ${warehouseFilter}
            GROUP BY b."materialId", b."warehouseId"
            LIMIT 2000
        `

        const buckets: Record<string, { count: number; quantity: number }> = {}
        for (const b of bucketsDef) {
            buckets[b.name] = { count: 0, quantity: 0 }
        }
        const now = Date.now()
        for (const r of rows) {
            const days = r.lastInbound
                ? Math.floor((now - new Date(r.lastInbound).getTime()) / 86400000)
                : 999
            const bucket = resolveAgingBucket(days, bucketsDef)
            if (!buckets[bucket]) buckets[bucket] = { count: 0, quantity: 0 }
            buckets[bucket].count++
            buckets[bucket].quantity += Number(r.qty) || 0
        }
        return {
            type: 'AGING',
            definition:
                'Age from last inbound (RECEIPT / TRANSFER_IN / RETURN_IN) to today',
            agingBuckets: bucketsDef.map((b) => b.name),
            buckets: Object.entries(buckets).map(([name, v]) => ({
                name,
                ...v,
            })),
        }
    }

    private async computeTurnoverMetric(filters: DashboardFilters) {
        const from = filters.dateFrom
            ? new Date(filters.dateFrom)
            : new Date(Date.now() - 90 * 86400000)
        const to = filters.dateTo ? new Date(filters.dateTo) : new Date()

        const issues = await this.prisma.mmInventoryTransaction.groupBy({
            by: ['materialId'],
            where: {
                companyId: filters.companyId,
                movementType: { in: ['ISSUE', 'TRANSFER_OUT', 'SCRAP', 'RETURN_OUT'] },
                postingDate: { gte: from, lte: to },
                ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
            },
            _sum: { quantity: true },
            orderBy: { _sum: { quantity: 'desc' } },
            take: 50,
        })

        const onHand = await this.prisma.mmInventoryBalance.groupBy({
            by: ['materialId'],
            where: {
                companyId: filters.companyId,
                ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
            },
            _sum: { quantity: true },
        })
        const onHandMap = new Map(
            onHand.map((r) => [r.materialId, Number(r._sum.quantity ?? 0)]),
        )

        const materialIds = issues.map((i) => i.materialId)
        const materials = await this.prisma.mmMaterial.findMany({
            where: { id: { in: materialIds } },
            select: { id: true, materialCode: true, materialName: true },
        })
        const matMap = new Map(materials.map((m) => [m.id, m]))

        const rows = issues.map((i) => {
            const issueQty = Number(i._sum.quantity ?? 0)
            const avg = onHandMap.get(i.materialId) ?? 0
            return {
                materialId: i.materialId,
                materialCode: matMap.get(i.materialId)?.materialCode,
                materialName: matMap.get(i.materialId)?.materialName,
                issueQty,
                averageOnHand: avg,
                turnover: computeTurnover(issueQty, avg),
            }
        })

        return {
            type: 'TURNOVER',
            definition:
                'issueQty / averageOnHand; issues include ISSUE, TRANSFER_OUT, SCRAP, RETURN_OUT',
            period: { from, to },
            rows,
        }
    }

    private async computeDeadStock(filters: DashboardFilters) {
        const days = filters.deadStockDays ?? 90
        const cutoff = new Date(Date.now() - days * 86400000)

        const moved = await this.prisma.mmInventoryTransaction.findMany({
            where: {
                companyId: filters.companyId,
                movementType: { in: ['ISSUE', 'TRANSFER_OUT'] },
                postingDate: { gte: cutoff },
                ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
            },
            select: { materialId: true },
            distinct: ['materialId'],
        })
        const movedSet = new Set(moved.map((m) => m.materialId))

        const balances = await this.prisma.mmInventoryBalance.findMany({
            where: {
                companyId: filters.companyId,
                quantity: { gt: 0 },
                ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
                ...(filters.materialCategoryId
                    ? { material: { materialCategoryId: filters.materialCategoryId } }
                    : {}),
            },
            include: {
                material: {
                    select: { id: true, materialCode: true, materialName: true },
                },
            },
            take: 2000,
        })

        const byMaterial = new Map<string, { material: any; quantity: number }>()
        for (const b of balances) {
            if (movedSet.has(b.materialId)) continue
            const cur = byMaterial.get(b.materialId) ?? {
                material: b.material,
                quantity: 0,
            }
            cur.quantity += Number(b.quantity)
            byMaterial.set(b.materialId, cur)
        }

        const rows = Array.from(byMaterial.entries()).map(([materialId, v]) => ({
            materialId,
            materialCode: v.material?.materialCode,
            materialName: v.material?.materialName,
            quantity: v.quantity,
            daysWithoutMovement: days,
        }))

        return { type: 'DEAD_STOCK', deadStockDays: days, rows, count: rows.length }
    }

    private async computeMovement(filters: DashboardFilters) {
        const from = filters.dateFrom
            ? new Date(filters.dateFrom)
            : new Date(Date.now() - 30 * 86400000)
        const to = filters.dateTo ? new Date(filters.dateTo) : new Date()

        const warehouseFilter = filters.warehouseId
            ? Prisma.sql`AND "warehouseId" = ${filters.warehouseId}`
            : Prisma.empty

        const rows = await this.prisma.$queryRaw<
            { day: Date; inbound: number; outbound: number }[]
        >`
            SELECT date_trunc('day', "postingDate") AS day,
                   SUM(CASE WHEN "movementType" IN ('RECEIPT','TRANSFER_IN','RETURN_IN','ADJUSTMENT_IN','COUNT_GAIN')
                            THEN quantity ELSE 0 END)::float AS inbound,
                   SUM(CASE WHEN "movementType" IN ('ISSUE','TRANSFER_OUT','RETURN_OUT','SCRAP','ADJUSTMENT_OUT','COUNT_LOSS')
                            THEN quantity ELSE 0 END)::float AS outbound
            FROM mm_inventory_transactions
            WHERE "companyId" = ${filters.companyId}
              AND "postingDate" >= ${from}
              AND "postingDate" <= ${to}
              ${warehouseFilter}
            GROUP BY 1
            ORDER BY 1
        `

        return {
            type: 'MOVEMENT',
            period: { from, to },
            series: rows.map((r) => ({
                date: r.day,
                inbound: Number(r.inbound) || 0,
                outbound: Number(r.outbound) || 0,
            })),
        }
    }

    private async computeSpend(filters: DashboardFilters) {
        const from = filters.dateFrom
            ? new Date(filters.dateFrom)
            : new Date(Date.now() - 90 * 86400000)
        const to = filters.dateTo ? new Date(filters.dateTo) : new Date()

        const pos = await this.prisma.mmPurchaseOrder.findMany({
            where: {
                companyId: filters.companyId,
                status: { notIn: ['CANCELLED', 'DRAFT'] },
                createdAt: { gte: from, lte: to },
                ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
                ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
            },
            select: {
                supplierId: true,
                totalAmount: true,
                supplier: { select: { supplierCode: true, supplierName: true } },
                lines: {
                    select: {
                        lineTotal: true,
                        materialId: true,
                        material: {
                            select: {
                                materialCode: true,
                                materialCategoryId: true,
                                materialCategory: { select: { name: true } },
                            },
                        },
                    },
                },
            },
            take: 500,
        })

        const bySupplier = new Map<string, { name: string; code: string; amount: number }>()
        const byCategory = new Map<string, { name: string; amount: number }>()
        const byMaterial = new Map<string, { code: string; amount: number }>()

        for (const po of pos) {
            const s = bySupplier.get(po.supplierId) ?? {
                name: po.supplier.supplierName,
                code: po.supplier.supplierCode,
                amount: 0,
            }
            s.amount += Number(po.totalAmount)
            bySupplier.set(po.supplierId, s)

            for (const line of po.lines) {
                if (
                    filters.materialCategoryId &&
                    line.material.materialCategoryId !== filters.materialCategoryId
                ) {
                    continue
                }
                const catId = line.material.materialCategoryId
                const c = byCategory.get(catId) ?? {
                    name: line.material.materialCategory?.name ?? catId,
                    amount: 0,
                }
                c.amount += Number(line.lineTotal)
                byCategory.set(catId, c)

                const m = byMaterial.get(line.materialId) ?? {
                    code: line.material.materialCode,
                    amount: 0,
                }
                m.amount += Number(line.lineTotal)
                byMaterial.set(line.materialId, m)
            }
        }

        const sortDesc = <T extends { amount: number }>(arr: T[]) =>
            arr.sort((a, b) => b.amount - a.amount).slice(0, 20)

        return {
            type: 'PROCUREMENT_SPEND',
            period: { from, to },
            bySupplier: sortDesc(
                Array.from(bySupplier.entries()).map(([id, v]) => ({ supplierId: id, ...v })),
            ),
            byCategory: sortDesc(
                Array.from(byCategory.entries()).map(([id, v]) => ({ categoryId: id, ...v })),
            ),
            byMaterial: sortDesc(
                Array.from(byMaterial.entries()).map(([id, v]) => ({ materialId: id, ...v })),
            ),
        }
    }

    private async computeProcurement(filters: DashboardFilters) {
        const spend = await this.computeSpend(filters)
        const from = filters.dateFrom
            ? new Date(filters.dateFrom)
            : new Date(Date.now() - 90 * 86400000)
        const to = filters.dateTo ? new Date(filters.dateTo) : new Date()

        const pos = await this.prisma.mmPurchaseOrder.findMany({
            where: {
                companyId: filters.companyId,
                status: { notIn: ['CANCELLED', 'DRAFT'] },
                createdAt: { gte: from, lte: to },
                ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
                ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
            },
            select: {
                id: true,
                createdAt: true,
                expectedDeliveryDate: true,
                totalAmount: true,
                lines: {
                    select: {
                        materialId: true,
                        unitPrice: true,
                        material: { select: { materialCode: true } },
                    },
                },
            },
            take: 500,
        })

        const leadDays = pos
            .filter((p) => p.expectedDeliveryDate)
            .map((p) =>
                Math.max(
                    0,
                    Math.round(
                        (new Date(p.expectedDeliveryDate!).getTime() -
                            new Date(p.createdAt).getTime()) /
                            86400000,
                    ),
                ),
            )
        const avgLeadDays = leadDays.length
            ? Number(
                  (
                      leadDays.reduce((a, b) => a + b, 0) / leadDays.length
                  ).toFixed(2),
              )
            : 0

        const priceTrendMap = new Map<
            string,
            Map<string, { prices: number[]; code: string }>
        >()
        for (const po of pos) {
            const month = po.createdAt.toISOString().slice(0, 7)
            for (const line of po.lines) {
                const matMap =
                    priceTrendMap.get(line.materialId) ??
                    new Map<string, { prices: number[]; code: string }>()
                const bucket = matMap.get(month) ?? {
                    prices: [],
                    code: line.material.materialCode,
                }
                bucket.prices.push(Number(line.unitPrice))
                matMap.set(month, bucket)
                priceTrendMap.set(line.materialId, matMap)
            }
        }

        const priceTrend = Array.from(priceTrendMap.entries())
            .map(([materialId, months]) => ({
                materialId,
                materialCode: [...months.values()][0]?.code,
                points: [...months.entries()]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([month, v]) => ({
                        month,
                        avgUnitPrice: Number(
                            (
                                v.prices.reduce((a, b) => a + b, 0) /
                                v.prices.length
                            ).toFixed(4),
                        ),
                    })),
            }))
            .slice(0, 20)

        const totalSpend = pos.reduce((s, p) => s + Number(p.totalAmount), 0)

        return {
            type: 'PROCUREMENT',
            period: spend.period,
            poCount: pos.length,
            totalSpend,
            avgLeadDays,
            bySupplier: spend.bySupplier,
            byCategory: spend.byCategory,
            byMaterial: spend.byMaterial,
            priceTrend,
        }
    }

    private async computeSuppliers(filters: DashboardFilters) {
        const evals = await this.prisma.mmSupplierEvaluation.findMany({
            where: {
                companyId: filters.companyId,
                ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
            },
            include: {
                supplier: {
                    select: { id: true, supplierCode: true, supplierName: true },
                },
            },
            orderBy: { periodEnd: 'desc' },
            take: 200,
        })

        // Latest per supplier
        const latest = new Map<string, (typeof evals)[0]>()
        for (const e of evals) {
            if (!latest.has(e.supplierId)) latest.set(e.supplierId, e)
        }
        const ranked = Array.from(latest.values())
            .map((e) => ({
                supplierId: e.supplierId,
                supplierCode: e.supplier.supplierCode,
                supplierName: e.supplier.supplierName,
                overallScore: Number(e.overallScore),
                qualityScore: Number(e.qualityScore),
                deliveryScore: Number(e.deliveryScore),
            }))
            .sort((a, b) => b.overallScore - a.overallScore)

        return {
            type: 'SUPPLIERS',
            top: ranked.slice(0, 5),
            bottom: ranked.slice(-5).reverse(),
            href: '/modules/mm/supplier-management/supplier-performance',
        }
    }
}
