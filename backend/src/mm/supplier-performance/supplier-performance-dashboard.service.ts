import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { DashboardQueryDto } from './dto/supplier-performance.dto'
import { aggregateTrend } from './score-engine'

@Injectable()
export class SupplierPerformanceDashboardService {
    constructor(private prisma: PrismaService) {}

    async getDashboard(query: DashboardQueryDto) {
        const where: any = { companyId: query.companyId }
        if (query.periodStart && query.periodEnd) {
            where.periodStart = new Date(query.periodStart)
            where.periodEnd = new Date(query.periodEnd)
        } else {
            // Latest evaluation period across company
            const latest = await this.prisma.mmSupplierEvaluation.findFirst({
                where: { companyId: query.companyId },
                orderBy: { periodEnd: 'desc' },
                select: { periodStart: true, periodEnd: true },
            })
            if (latest) {
                where.periodStart = latest.periodStart
                where.periodEnd = latest.periodEnd
            }
        }

        const rankings = await this.prisma.mmSupplierEvaluation.findMany({
            where,
            include: {
                supplier: {
                    select: {
                        id: true,
                        supplierCode: true,
                        supplierName: true,
                        status: true,
                    },
                },
            },
            orderBy: { overallScore: 'desc' },
            take: 50,
        })

        const openAlerts = await this.prisma.mmSupplierAlert.count({
            where: { companyId: query.companyId, status: 'OPEN' },
        })

        const summary = {
            suppliersEvaluated: rankings.length,
            avgOverallScore: rankings.length
                ? rankings.reduce((s, r) => s + Number(r.overallScore), 0) /
                  rankings.length
                : 0,
            avgDelivery: rankings.length
                ? rankings.reduce((s, r) => s + Number(r.deliveryScore), 0) /
                  rankings.length
                : 0,
            avgQuality: rankings.length
                ? rankings.reduce((s, r) => s + Number(r.qualityScore), 0) /
                  rankings.length
                : 0,
            avgReturnRate: rankings.length
                ? rankings.reduce((s, r) => s + Number(r.returnRate), 0) /
                  rankings.length
                : 0,
            avgPriceScore: rankings.length
                ? rankings.reduce((s, r) => s + Number(r.priceScore), 0) /
                  rankings.length
                : 0,
            totalPurchaseVolume: rankings.reduce(
                (s, r) => s + Number(r.purchaseVolume),
                0,
            ),
            openAlerts,
        }

        // Trend: last 6 periods company-wide avg overall
        const recent = await this.prisma.mmSupplierEvaluation.findMany({
            where: { companyId: query.companyId },
            orderBy: { periodStart: 'desc' },
            take: 200,
            select: {
                periodStart: true,
                periodEnd: true,
                overallScore: true,
                deliveryScore: true,
                qualityScore: true,
                priceScore: true,
                serviceScore: true,
                complianceScore: true,
                purchaseVolume: true,
            },
        })

        const byPeriod = new Map<string, typeof recent>()
        for (const r of recent) {
            const key = `${r.periodStart.toISOString()}|${r.periodEnd.toISOString()}`
            if (!byPeriod.has(key)) byPeriod.set(key, [])
            byPeriod.get(key)!.push(r)
        }

        const trend = [...byPeriod.entries()]
            .map(([key, rows]) => {
                const [ps, pe] = key.split('|')
                const n = rows.length || 1
                return {
                    periodStart: new Date(ps),
                    periodEnd: new Date(pe),
                    overallScore:
                        rows.reduce((s, r) => s + Number(r.overallScore), 0) / n,
                    deliveryScore:
                        rows.reduce((s, r) => s + Number(r.deliveryScore), 0) / n,
                    qualityScore:
                        rows.reduce((s, r) => s + Number(r.qualityScore), 0) / n,
                    priceScore:
                        rows.reduce((s, r) => s + Number(r.priceScore), 0) / n,
                    serviceScore:
                        rows.reduce((s, r) => s + Number(r.serviceScore), 0) / n,
                    complianceScore:
                        rows.reduce((s, r) => s + Number(r.complianceScore), 0) /
                        n,
                    purchaseVolume: rows.reduce(
                        (s, r) => s + Number(r.purchaseVolume),
                        0,
                    ),
                }
            })
            .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())
            .slice(-6)

        return {
            period: rankings[0]
                ? {
                      periodStart: rankings[0].periodStart,
                      periodEnd: rankings[0].periodEnd,
                  }
                : where.periodStart
                  ? { periodStart: where.periodStart, periodEnd: where.periodEnd }
                  : null,
            summary,
            rankings,
            trend: aggregateTrend(trend),
        }
    }
}
