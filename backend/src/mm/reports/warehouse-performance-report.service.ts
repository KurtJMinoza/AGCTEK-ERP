import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ReportsQueryDto } from './dto/reports.dto'
import { resolveWarehouseIds } from './reports.helpers'

@Injectable()
export class WarehousePerformanceReportService {
    constructor(private prisma: PrismaService) {}

    async query(query: ReportsQueryDto) {
        const from = query.dateFrom
            ? new Date(query.dateFrom)
            : new Date(Date.now() - 30 * 86400000)
        const to = query.dateTo ? new Date(query.dateTo) : new Date()
        const warehouseIds = await resolveWarehouseIds(this.prisma, query)

        const whFilter = warehouseIds ? { warehouseId: { in: warehouseIds } } : {}
        const wmWhFilter = warehouseIds
            ? { warehouseId: { in: warehouseIds } }
            : { warehouse: { companyId: query.companyId } }
        const companyWh = {
            companyId: query.companyId,
            ...whFilter,
        }

        const [
            grAgg,
            putawayOpen,
            putawayCompleted,
            pickOpen,
            pickCompleted,
            packOpen,
            packCompleted,
            binTransfers,
            transferVolume,
            bins,
            occupiedByBin,
        ] = await Promise.all([
            this.prisma.mmGoodsReceipt.aggregate({
                where: {
                    ...companyWh,
                    status: 'POSTED',
                    postingDate: { gte: from, lte: to },
                },
                _count: { id: true },
            }),
            this.prisma.wmPutawayTask.count({
                where: {
                    ...wmWhFilter,
                    status: { notIn: ['COMPLETED', 'CANCELLED'] },
                    createdAt: { gte: from, lte: to },
                },
            }),
            this.prisma.wmPutawayTask.findMany({
                where: {
                    ...wmWhFilter,
                    status: 'COMPLETED',
                    completedAt: { gte: from, lte: to },
                },
                select: { createdAt: true, completedAt: true },
            }),
            this.prisma.wmPickingTask.count({
                where: {
                    ...wmWhFilter,
                    status: { notIn: ['COMPLETED', 'CANCELLED'] },
                    createdAt: { gte: from, lte: to },
                },
            }),
            this.prisma.wmPickingTask.findMany({
                where: {
                    ...wmWhFilter,
                    status: 'COMPLETED',
                    completedAt: { gte: from, lte: to },
                },
                select: { createdAt: true, completedAt: true },
            }),
            this.prisma.wmPackage.count({
                where: {
                    ...wmWhFilter,
                    status: { in: ['OPEN', 'VERIFIED'] },
                    createdAt: { gte: from, lte: to },
                },
            }),
            this.prisma.wmPackage.count({
                where: {
                    ...wmWhFilter,
                    status: { in: ['SEALED', 'READY_FOR_DISPATCH', 'DISPATCHED'] },
                    updatedAt: { gte: from, lte: to },
                },
            }),
            this.prisma.mmBinTransfer.count({
                where: {
                    ...companyWh,
                    status: 'POSTED',
                    postingDate: { gte: from, lte: to },
                },
            }),
            this.prisma.wmWarehouseTransfer.count({
                where: {
                    ...(warehouseIds
                        ? {
                              OR: [
                                  { sourceWarehouseId: { in: warehouseIds } },
                                  { destinationWarehouseId: { in: warehouseIds } },
                              ],
                          }
                        : {
                              OR: [
                                  { sourceWarehouse: { companyId: query.companyId } },
                                  { destinationWarehouse: { companyId: query.companyId } },
                              ],
                          }),
                    status: 'COMPLETED',
                    updatedAt: { gte: from, lte: to },
                },
            }),
            this.prisma.wmStorageBin.findMany({
                where: {
                    deletedAt: null,
                    storageSection: {
                        storageType: {
                            warehouse: {
                                companyId: query.companyId,
                                ...(warehouseIds ? { id: { in: warehouseIds } } : {}),
                            },
                        },
                    },
                },
                select: { id: true, capacityQuantity: true },
            }),
            this.prisma.mmInventoryBalance.groupBy({
                by: ['storageBinId'],
                where: {
                    companyId: query.companyId,
                    quantity: { gt: 0 },
                    storageBinId: { not: null },
                    ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
                },
                _sum: { quantity: true },
            }),
        ])

        const grLines = await this.prisma.mmGoodsReceiptLine.aggregate({
            where: {
                receipt: {
                    ...companyWh,
                    status: 'POSTED',
                    postingDate: { gte: from, lte: to },
                },
            },
            _sum: { quantity: true },
        })

        const avgHours = (tasks: { createdAt: Date; completedAt: Date | null }[]) => {
            const deltas = tasks
                .filter((t) => t.completedAt)
                .map(
                    (t) =>
                        (new Date(t.completedAt!).getTime() -
                            new Date(t.createdAt).getTime()) /
                        3600000,
                )
            if (!deltas.length) return 0
            return Number(
                (deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(2),
            )
        }

        const putawayTotal = putawayOpen + putawayCompleted.length
        const pickTotal = pickOpen + pickCompleted.length
        const packTotal = packOpen + packCompleted

        let totalCapacity = 0
        let totalOccupied = 0
        const occupiedMap = new Map(
            occupiedByBin
                .filter((r) => r.storageBinId)
                .map((r) => [r.storageBinId!, Number(r._sum.quantity ?? 0)]),
        )
        for (const bin of bins) {
            const cap = Number(bin.capacityQuantity ?? 0)
            if (cap <= 0) continue
            totalCapacity += cap
            totalOccupied += occupiedMap.get(bin.id) ?? 0
        }

        return {
            type: 'WAREHOUSE_PERFORMANCE',
            period: { from, to },
            receiving: {
                documentCount: grAgg._count.id,
                quantityReceived: Number(grLines._sum.quantity ?? 0),
            },
            putaway: {
                open: putawayOpen,
                completed: putawayCompleted.length,
                completionRate:
                    putawayTotal > 0
                        ? Number(
                              (
                                  putawayCompleted.length / putawayTotal
                              ).toFixed(4),
                          )
                        : 0,
                avgCompletionHours: avgHours(putawayCompleted),
            },
            picking: {
                open: pickOpen,
                completed: pickCompleted.length,
                completionRate:
                    pickTotal > 0
                        ? Number(
                              (pickCompleted.length / pickTotal).toFixed(4),
                          )
                        : 0,
                avgCompletionHours: avgHours(pickCompleted),
            },
            packing: {
                open: packOpen,
                completed: packCompleted,
                completionRate:
                    packTotal > 0
                        ? Number((packCompleted / packTotal).toFixed(4))
                        : 0,
            },
            transfers: {
                binTransferCount: binTransfers,
                warehouseTransferCount: transferVolume,
            },
            binUtilization: {
                binsTracked: bins.filter((b) => Number(b.capacityQuantity) > 0)
                    .length,
                totalCapacity,
                totalOccupied,
                utilizationPct:
                    totalCapacity > 0
                        ? Number(
                              ((totalOccupied / totalCapacity) * 100).toFixed(2),
                          )
                        : 0,
            },
        }
    }
}
