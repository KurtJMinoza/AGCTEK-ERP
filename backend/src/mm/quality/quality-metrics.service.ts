import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { deriveCapaStatus } from './quality.constants'

/**
 * Read-only quality metrics — consumed by MM-14 analytics and MM-13 supplier performance.
 * Must NEVER write operational tables.
 */
@Injectable()
export class QualityMetricsService {
    constructor(private prisma: PrismaService) {}

    // ── Shared period filter builder ──

    private buildPeriodWhere(query: MetricsQuery) {
        const from = query.dateFrom
            ? new Date(query.dateFrom)
            : new Date(Date.now() - 30 * 86400000)
        const to = query.dateTo ? new Date(query.dateTo) : new Date()
        return { from, to }
    }

    private companyFilter(companyId?: string) {
        return companyId ? { companyId } : {}
    }

    // ── DefectTrend ──

    async getDefectTrend(query: MetricsQuery): Promise<DefectTrend> {
        const { from, to } = this.buildPeriodWhere(query)
        const where: any = {
            createdAt: { gte: from, lte: to },
            ...(query.companyId
                ? { inspectionLot: { companyId: query.companyId } }
                : {}),
            ...(query.supplierId
                ? { inspectionLot: { supplierId: query.supplierId } }
                : {}),
            ...(query.materialId
                ? { inspectionLot: { materialId: query.materialId } }
                : {}),
        }

        const defects = await this.prisma.mmInspectionDefect.findMany({
            where,
            select: {
                defectCode: true,
                quantity: true,
                severity: true,
                createdAt: true,
            },
            take: 5000,
            orderBy: { createdAt: 'asc' },
        })

        const bucketMap = new Map<string, Map<string, number>>()
        for (const d of defects) {
            const week = toWeekBucket(d.createdAt)
            if (!bucketMap.has(week)) bucketMap.set(week, new Map())
            const codeMap = bucketMap.get(week)!
            codeMap.set(d.defectCode, (codeMap.get(d.defectCode) ?? 0) + Number(d.quantity))
        }

        const buckets: DefectTrendBucket[] = []
        for (const [week, codeMap] of bucketMap) {
            const codes: { code: string; count: number }[] = []
            for (const [code, count] of codeMap) codes.push({ code, count })
            codes.sort((a, b) => b.count - a.count)
            buckets.push({
                week,
                total: codes.reduce((s, c) => s + c.count, 0),
                codes,
            })
        }

        const topMap = new Map<string, number>()
        for (const d of defects) {
            topMap.set(d.defectCode, (topMap.get(d.defectCode) ?? 0) + Number(d.quantity))
        }
        const topDefects = [...topMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([code, count]) => ({ code, count }))

        return { buckets, topDefects, period: { from, to } }
    }

    // ── SupplierQualityMetric ──

    async getSupplierQualityMetrics(query: MetricsQuery): Promise<SupplierQualityMetric[]> {
        const { from, to } = this.buildPeriodWhere(query)
        const lotWhere: any = {
            createdAt: { gte: from, lte: to },
            supplierId: { not: null },
            ...this.companyFilter(query.companyId),
            ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        }

        const lots = await this.prisma.mmInspectionLot.findMany({
            where: lotWhere,
            include: {
                decisions: { select: { decisionCode: true, quantity: true } },
                defects: { select: { quantity: true } },
                supplier: { select: { id: true, supplierCode: true, supplierName: true } },
            },
            take: 5000,
        })

        const ncCounts = await this.prisma.mmNonconformance.groupBy({
            by: ['inspectionLotId'],
            where: {
                ...this.companyFilter(query.companyId),
                status: { notIn: ['CLOSED', 'RESOLVED'] },
                inspectionLotId: { not: null },
            },
            _count: { id: true },
        })
        const ncByLot = new Map(ncCounts.map((n) => [n.inspectionLotId, n._count.id]))

        const bySupplier = new Map<string, SupplierQualityMetric>()
        for (const lot of lots) {
            if (!lot.supplierId || !lot.supplier) continue
            const sid = lot.supplierId
            if (!bySupplier.has(sid)) {
                bySupplier.set(sid, {
                    supplierId: sid,
                    supplierCode: lot.supplier.supplierCode,
                    supplierName: lot.supplier.supplierName,
                    lotsInspected: 0,
                    totalQty: 0,
                    acceptedQty: 0,
                    rejectedQty: 0,
                    defectQty: 0,
                    acceptanceRate: 0,
                    rejectionRate: 0,
                    openNcCount: 0,
                })
            }
            const m = bySupplier.get(sid)!
            m.lotsInspected++
            const qty = Number(lot.quantity)
            m.totalQty += qty

            for (const d of lot.decisions) {
                if (['ACCEPT', 'ACCEPT_WITH_DEVIATION'].includes(d.decisionCode)) {
                    m.acceptedQty += Number(d.quantity)
                } else {
                    m.rejectedQty += Number(d.quantity)
                }
            }
            for (const def of lot.defects) {
                m.defectQty += Number(def.quantity)
            }
            m.openNcCount += ncByLot.get(lot.id) ?? 0
        }

        const result = [...bySupplier.values()]
        for (const m of result) {
            m.acceptanceRate = m.totalQty > 0 ? m.acceptedQty / m.totalQty : 0
            m.rejectionRate = m.totalQty > 0 ? m.rejectedQty / m.totalQty : 0
        }
        return result.sort((a, b) => b.lotsInspected - a.lotsInspected)
    }

    // ── MaterialQualityMetric ──

    async getMaterialQualityMetrics(query: MetricsQuery): Promise<MaterialQualityMetric[]> {
        const { from, to } = this.buildPeriodWhere(query)
        const lotWhere: any = {
            createdAt: { gte: from, lte: to },
            ...this.companyFilter(query.companyId),
            ...(query.materialId ? { materialId: query.materialId } : {}),
        }

        const lots = await this.prisma.mmInspectionLot.findMany({
            where: lotWhere,
            include: {
                decisions: { select: { decisionCode: true, quantity: true } },
                defects: { select: { quantity: true } },
                material: { select: { id: true, materialCode: true, materialName: true } },
            },
            take: 5000,
        })

        const byMaterial = new Map<string, MaterialQualityMetric>()
        for (const lot of lots) {
            const mid = lot.materialId
            if (!byMaterial.has(mid)) {
                byMaterial.set(mid, {
                    materialId: mid,
                    materialCode: lot.material.materialCode,
                    materialName: lot.material.materialName,
                    lotsInspected: 0,
                    totalQty: 0,
                    acceptedQty: 0,
                    rejectedQty: 0,
                    defectQty: 0,
                    acceptanceRate: 0,
                    rejectionRate: 0,
                })
            }
            const m = byMaterial.get(mid)!
            m.lotsInspected++
            m.totalQty += Number(lot.quantity)
            for (const d of lot.decisions) {
                if (['ACCEPT', 'ACCEPT_WITH_DEVIATION'].includes(d.decisionCode)) {
                    m.acceptedQty += Number(d.quantity)
                } else {
                    m.rejectedQty += Number(d.quantity)
                }
            }
            for (const def of lot.defects) {
                m.defectQty += Number(def.quantity)
            }
        }

        const result = [...byMaterial.values()]
        for (const m of result) {
            m.acceptanceRate = m.totalQty > 0 ? m.acceptedQty / m.totalQty : 0
            m.rejectionRate = m.totalQty > 0 ? m.rejectedQty / m.totalQty : 0
        }
        return result.sort((a, b) => b.lotsInspected - a.lotsInspected)
    }

    // ── QualityHoldAging ──

    async getQualityHoldAging(query: MetricsQuery): Promise<QualityHoldAging> {
        const holds = await this.prisma.mmQualityHold.findMany({
            where: {
                ...this.companyFilter(query.companyId),
            },
            select: {
                status: true,
                heldAt: true,
                releasedAt: true,
            },
            take: 5000,
        })

        const now = Date.now()
        const buckets = { '0-7d': 0, '8-30d': 0, '31-90d': 0, '90d+': 0 }
        let releasedCount = 0
        let totalReleasedHours = 0

        for (const h of holds) {
            if (h.status === 'ACTIVE') {
                const ageDays = (now - h.heldAt.getTime()) / 86400000
                if (ageDays <= 7) buckets['0-7d']++
                else if (ageDays <= 30) buckets['8-30d']++
                else if (ageDays <= 90) buckets['31-90d']++
                else buckets['90d+']++
            } else if (h.releasedAt) {
                releasedCount++
                totalReleasedHours +=
                    (h.releasedAt.getTime() - h.heldAt.getTime()) / 3600000
            }
        }

        const activeCount = holds.filter((h) => h.status === 'ACTIVE').length

        return {
            activeCount,
            buckets,
            releasedCount,
            avgHoldDurationHours:
                releasedCount > 0
                    ? Math.round((totalReleasedHours / releasedCount) * 10) / 10
                    : 0,
        }
    }

    // ── InspectionTurnaround ──

    async getInspectionTurnaround(query: MetricsQuery): Promise<InspectionTurnaround> {
        const { from, to } = this.buildPeriodWhere(query)
        const lots = await this.prisma.mmInspectionLot.findMany({
            where: {
                createdAt: { gte: from, lte: to },
                ...this.companyFilter(query.companyId),
                ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
            },
            select: {
                createdAt: true,
                inspectedAt: true,
                priority: true,
                decisions: {
                    select: { decidedAt: true },
                    orderBy: { decidedAt: 'asc' },
                    take: 1,
                },
            },
            take: 5000,
        })

        const hoursAll: number[] = []
        const byPriority = new Map<string, number[]>()

        for (const lot of lots) {
            const end =
                lot.inspectedAt ?? lot.decisions[0]?.decidedAt ?? null
            if (!end) continue
            const hours =
                (end.getTime() - lot.createdAt.getTime()) / 3600000
            hoursAll.push(hours)

            const prio = lot.priority ?? 'NORMAL'
            if (!byPriority.has(prio)) byPriority.set(prio, [])
            byPriority.get(prio)!.push(hours)
        }

        hoursAll.sort((a, b) => a - b)

        const breakdown: Record<string, TurnaroundStats> = {}
        for (const [prio, arr] of byPriority) {
            arr.sort((a, b) => a - b)
            breakdown[prio] = computeTurnaroundStats(arr)
        }

        return {
            sampleSize: hoursAll.length,
            ...computeTurnaroundStats(hoursAll),
            byPriority: breakdown,
        }
    }

    // ── NonconformanceMetric ──

    async getNonconformanceMetric(query: MetricsQuery): Promise<NonconformanceMetric> {
        const { from, to } = this.buildPeriodWhere(query)
        const ncs = await this.prisma.mmNonconformance.findMany({
            where: {
                createdAt: { gte: from, lte: to },
                ...this.companyFilter(query.companyId),
            },
            select: {
                status: true,
                severity: true,
                createdAt: true,
                resolvedAt: true,
                correctiveActions: {
                    select: { status: true, dueDate: true },
                },
            },
            take: 5000,
        })

        const byStatus: Record<string, number> = {}
        const bySeverity: Record<string, number> = {}
        let resolved = 0
        let totalResolutionDays = 0
        let openCapaCount = 0

        for (const nc of ncs) {
            byStatus[nc.status] = (byStatus[nc.status] ?? 0) + 1
            if (nc.severity) {
                bySeverity[nc.severity] = (bySeverity[nc.severity] ?? 0) + 1
            }
            if (nc.resolvedAt) {
                resolved++
                totalResolutionDays +=
                    (nc.resolvedAt.getTime() - nc.createdAt.getTime()) / 86400000
            }
            for (const ca of nc.correctiveActions) {
                const effective = deriveCapaStatus(ca.status, ca.dueDate)
                if (!['CLOSED', 'VERIFIED', 'COMPLETED'].includes(effective)) {
                    openCapaCount++
                }
            }
        }

        return {
            total: ncs.length,
            byStatus,
            bySeverity,
            openCount: ncs.filter((n) =>
                !['CLOSED', 'RESOLVED'].includes(n.status),
            ).length,
            resolvedCount: resolved,
            avgResolutionDays:
                resolved > 0
                    ? Math.round((totalResolutionDays / resolved) * 10) / 10
                    : 0,
            openCapaCount,
            period: { from, to },
        }
    }

    // ── MM-13 bridge helper ──

    /**
     * Convert canonical inspection lots to QualityLine[] for score-engine.
     * Used by SupplierEvaluationService.gatherMetrics().
     */
    buildQualityLinesFromInspectionLots(
        lots: Array<{
            quantity: any
            decisions: Array<{ decisionCode: string; quantity: any }>
        }>,
    ): QualityLine[] {
        return lots.map((lot) => {
            const qty = Number(lot.quantity) || 0
            let pass = 0
            let fail = 0
            for (const d of lot.decisions) {
                const dQty = Number(d.quantity) || 0
                if (['ACCEPT', 'ACCEPT_WITH_DEVIATION'].includes(d.decisionCode)) {
                    pass += dQty
                } else {
                    fail += dQty
                }
            }
            if (pass === 0 && fail === 0) {
                pass = qty
            }
            return { quantity: qty, passQuantity: pass, failQuantity: fail }
        })
    }
}

// ── Helpers ──

function toWeekBucket(date: Date): string {
    const d = new Date(date)
    const day = d.getUTCDay()
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
    d.setUTCDate(diff)
    return d.toISOString().slice(0, 10)
}

function computeTurnaroundStats(sorted: number[]): TurnaroundStats {
    if (!sorted.length) return { avgHours: 0, medianHours: 0, p90Hours: 0 }
    const sum = sorted.reduce((s, v) => s + v, 0)
    const avg = Math.round((sum / sorted.length) * 10) / 10
    const median =
        sorted.length % 2 === 0
            ? Math.round(
                  ((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) * 10,
              ) / 10
            : Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10
    const p90Idx = Math.min(
        Math.ceil(sorted.length * 0.9) - 1,
        sorted.length - 1,
    )
    const p90 = Math.round(sorted[p90Idx] * 10) / 10
    return { avgHours: avg, medianHours: median, p90Hours: p90 }
}

// ── Types ──

export type MetricsQuery = {
    companyId?: string
    warehouseId?: string
    supplierId?: string
    materialId?: string
    materialCategoryId?: string
    dateFrom?: string
    dateTo?: string
}

export type QualityLine = {
    quantity: number
    passQuantity: number
    failQuantity: number
}

export type DefectTrendBucket = {
    week: string
    total: number
    codes: { code: string; count: number }[]
}

export type DefectTrend = {
    buckets: DefectTrendBucket[]
    topDefects: { code: string; count: number }[]
    period: { from: Date; to: Date }
}

export type SupplierQualityMetric = {
    supplierId: string
    supplierCode: string
    supplierName: string
    lotsInspected: number
    totalQty: number
    acceptedQty: number
    rejectedQty: number
    defectQty: number
    acceptanceRate: number
    rejectionRate: number
    openNcCount: number
}

export type MaterialQualityMetric = {
    materialId: string
    materialCode: string
    materialName: string
    lotsInspected: number
    totalQty: number
    acceptedQty: number
    rejectedQty: number
    defectQty: number
    acceptanceRate: number
    rejectionRate: number
}

export type QualityHoldAging = {
    activeCount: number
    buckets: Record<string, number>
    releasedCount: number
    avgHoldDurationHours: number
}

export type TurnaroundStats = {
    avgHours: number
    medianHours: number
    p90Hours: number
}

export type InspectionTurnaround = TurnaroundStats & {
    sampleSize: number
    byPriority: Record<string, TurnaroundStats>
}

export type NonconformanceMetric = {
    total: number
    byStatus: Record<string, number>
    bySeverity: Record<string, number>
    openCount: number
    resolvedCount: number
    avgResolutionDays: number
    openCapaCount: number
    period: { from: Date; to: Date }
}
