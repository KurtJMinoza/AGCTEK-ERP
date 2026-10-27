import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
@Injectable()
export class InventoryCountDashboardService {
    constructor(private prisma: PrismaService) {}

    async metrics(companyId: string, warehouseId?: string) {
        const sessionWhere: any = { companyId }
        if (warehouseId) sessionWhere.warehouseId = warehouseId

        const [
            activePlans,
            activeSessions,
            openVariances,
            pendingAdj,
            pendingFinance,
            postedAdj,
            tasks,
            matchedTasks,
        ] = await Promise.all([
            this.prisma.mmCountPlan.count({
                where: {
                    companyId,
                    ...(warehouseId ? { warehouseId } : {}),
                    status: { in: ['PLANNED', 'OPEN', 'IN_PROGRESS', 'SCHEDULED'] },
                },
            }),
            this.prisma.mmCountSession.count({
                where: {
                    ...sessionWhere,
                    status: { in: ['OPEN', 'IN_PROGRESS', 'RECOUNT_REQUIRED', 'VARIANCE'] },
                },
            }),
            this.prisma.mmCountVariance.count({
                where: {
                    status: { in: ['OPEN', 'RECOUNT_REQUIRED', 'PENDING_ADJUSTMENT'] },
                    task: { session: sessionWhere },
                },
            }),
            this.prisma.mmCountAdjustmentRequest.count({
                where: {
                    companyId,
                    ...(warehouseId ? { warehouseId } : {}),
                    status: 'PENDING_APPROVAL',
                },
            }),
            this.prisma.mmCountAdjustmentRequest.count({
                where: {
                    companyId,
                    ...(warehouseId ? { warehouseId } : {}),
                    status: 'PENDING_FINANCE_APPROVAL',
                },
            }),
            this.prisma.mmCountAdjustmentRequest.count({
                where: {
                    companyId,
                    ...(warehouseId ? { warehouseId } : {}),
                    status: 'POSTED',
                },
            }),
            this.prisma.mmCountTask.count({
                where: {
                    session: sessionWhere,
                    status: { in: ['COUNTED', 'ADJUSTED', 'APPROVED', 'VARIANCE'] },
                },
            }),
            this.prisma.mmCountTask.count({
                where: {
                    session: sessionWhere,
                    status: { in: ['COUNTED', 'ADJUSTED', 'APPROVED'] },
                    variances: { none: { status: { in: ['OPEN', 'PENDING_ADJUSTMENT'] } } },
                },
            }),
        ])

        const accuracyPct =
            tasks > 0 ? Math.round((matchedTasks / tasks) * 1000) / 10 : null

        const valueAgg = await this.prisma.mmCountVariance.aggregate({
            where: {
                task: { session: sessionWhere },
                status: { in: ['OPEN', 'PENDING_ADJUSTMENT', 'INVESTIGATED'] },
            },
            _sum: { estimatedValue: true },
        })
        const netVarianceValue = Number(valueAgg._sum.estimatedValue ?? 0)

        return {
            companyId,
            warehouseId: warehouseId ?? null,
            generatedAt: new Date().toISOString(),
            plannedOrActivePlans: activePlans,
            activeCountSessions: activeSessions,
            openVariances,
            pendingWarehouseApprovals: pendingAdj,
            pendingFinanceApprovals: pendingFinance,
            postedAdjustments: postedAdj,
            inventoryAccuracyPercent: accuracyPct,
            openVarianceValue: netVarianceValue,
        }
    }
}
