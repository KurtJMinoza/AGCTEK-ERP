import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { PlanningDashboardQueryDto } from './dto/planning.dto'

@Injectable()
export class PlanningDashboardService {
    constructor(private prisma: PrismaService) {}

    async getDashboard(query: PlanningDashboardQueryDto) {
        const { companyId, warehouseId } = query
        const reqWhere: any = { companyId }
        if (warehouseId) reqWhere.warehouseId = warehouseId

        const latestRun = await this.prisma.mmMrpRun.findFirst({
            where: { companyId, status: 'COMPLETED' },
            orderBy: { executionTime: 'desc' },
            include: {
                warehouse: { select: { id: true, code: true, name: true } },
                _count: { select: { requirements: true, suggestions: true } },
            },
        })

        if (latestRun) {
            reqWhere.mrpRunId = latestRun.id
        }

        const [
            belowRop,
            shortages,
            openSuggestions,
            overdueInbound,
            stockoutRows,
        ] = await Promise.all([
            latestRun
                ? this.prisma.mmMaterialRequirement.count({
                      where: { ...reqWhere, belowReorderPoint: true },
                  })
                : 0,
            latestRun
                ? this.prisma.mmMaterialRequirement.count({
                      where: { ...reqWhere, shortage: true },
                  })
                : 0,
            this.prisma.mmProcurementSuggestion.count({
                where: {
                    companyId,
                    status: 'OPEN',
                    ...(warehouseId ? { warehouseId } : {}),
                },
            }),
            this.countOverdueInbound(companyId, warehouseId),
            latestRun
                ? this.prisma.mmMaterialRequirement.findMany({
                      where: {
                          ...reqWhere,
                          projectedStockoutDate: { not: null },
                      },
                      include: {
                          material: {
                              select: {
                                  id: true,
                                  materialCode: true,
                                  materialName: true,
                              },
                          },
                          warehouse: {
                              select: { id: true, code: true, name: true },
                          },
                      },
                      orderBy: { projectedStockoutDate: 'asc' },
                      take: 20,
                  })
                : [],
        ])

        const topShortages = latestRun
            ? await this.prisma.mmMaterialRequirement.findMany({
                  where: { ...reqWhere, shortage: true },
                  include: {
                      material: {
                          select: {
                              id: true,
                              materialCode: true,
                              materialName: true,
                          },
                      },
                      warehouse: {
                          select: { id: true, code: true, name: true },
                      },
                  },
                  orderBy: { netRequirement: 'desc' },
                  take: 10,
              })
            : []

        const recentSuggestions =
            await this.prisma.mmProcurementSuggestion.findMany({
                where: {
                    companyId,
                    status: 'OPEN',
                    ...(warehouseId ? { warehouseId } : {}),
                },
                include: {
                    material: {
                        select: {
                            id: true,
                            materialCode: true,
                            materialName: true,
                        },
                    },
                    warehouse: {
                        select: { id: true, code: true, name: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: 10,
            })

        return {
            latestRun,
            summary: {
                belowReorderPoint: belowRop,
                shortages,
                openSuggestions,
                overdueInbound,
                projectedStockouts: stockoutRows.length,
            },
            topShortages,
            projectedStockouts: stockoutRows,
            recentSuggestions,
        }
    }

    private async countOverdueInbound(
        companyId: string,
        warehouseId?: string,
    ) {
        const today = new Date()
        const lines = await this.prisma.mmPurchaseOrderLine.findMany({
            where: {
                purchaseOrder: {
                    companyId,
                    status: { in: ['SENT', 'PARTIALLY_RECEIVED'] },
                    ...(warehouseId ? { warehouseId } : {}),
                },
                ...(warehouseId
                    ? {
                          OR: [
                              { warehouseId },
                              { warehouseId: null },
                          ],
                      }
                    : {}),
                OR: [
                    { expectedDeliveryDate: { lt: today } },
                    { requiredDate: { lt: today } },
                ],
            },
            select: {
                id: true,
                quantity: true,
                receivedQuantity: true,
            },
        })
        return lines.filter((l) => Number(l.quantity) - Number(l.receivedQuantity) > 0)
            .length
    }
}
