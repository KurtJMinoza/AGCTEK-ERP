import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ReportsQueryDto } from './dto/reports.dto'
import { clampLimit, resolveWarehouseIds } from './reports.helpers'

@Injectable()
export class StockVarianceReportService {
    constructor(private prisma: PrismaService) {}

    async query(query: ReportsQueryDto) {
        const page = query.page ?? 1
        const limit = clampLimit(query.limit)
        const skip = (page - 1) * limit
        const warehouseIds = await resolveWarehouseIds(this.prisma, query)

        const countWhere: any = {
            companyId: query.companyId,
            ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
        }

        const where: any = {
            status: { in: ['COUNTED', 'RECOUNTED', 'APPROVED', 'ADJUSTED'] },
            OR: [
                { varianceQuantity: { not: 0 } },
                { countedQuantity: { not: null } },
            ],
            count: countWhere,
            ...(query.materialId ? { materialId: query.materialId } : {}),
        }

        const [rows, total, agg] = await Promise.all([
            this.prisma.mmInventoryCountLine.findMany({
                where,
                include: {
                    material: {
                        select: {
                            id: true,
                            materialCode: true,
                            materialName: true,
                        },
                    },
                    storageBin: { select: { id: true, code: true } },
                    count: {
                        select: {
                            id: true,
                            countNumber: true,
                            warehouseId: true,
                            warehouse: { select: { id: true, name: true, code: true } },
                        },
                    },
                },
                orderBy: [{ updatedAt: 'desc' }],
                skip,
                take: limit,
            }),
            this.prisma.mmInventoryCountLine.count({ where }),
            this.prisma.mmInventoryCountLine.aggregate({
                where,
                _sum: { varianceQuantity: true, varianceValue: true },
            }),
        ])

        const data = rows.map((r) => ({
            id: r.id,
            countId: r.countId,
            countNumber: r.count.countNumber,
            warehouseId: r.count.warehouseId,
            warehouseName: r.count.warehouse.name,
            warehouseCode: r.count.warehouse.code,
            materialId: r.materialId,
            materialCode: r.material.materialCode,
            materialName: r.material.materialName,
            storageBinId: r.storageBinId,
            storageBinCode: r.storageBin?.code ?? null,
            systemQuantity: Number(r.systemQuantity),
            countedQuantity:
                r.finalQuantity != null
                    ? Number(r.finalQuantity)
                    : r.recountQuantity != null
                      ? Number(r.recountQuantity)
                      : r.countedQuantity != null
                        ? Number(r.countedQuantity)
                        : null,
            varianceQuantity: Number(r.varianceQuantity),
            varianceValue: Number(r.varianceValue),
            unitCost: Number(r.unitCost),
            status: r.status,
        }))

        return {
            type: 'STOCK_VARIANCE',
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit) || 1,
            },
            totals: {
                varianceQuantity: Number(agg._sum.varianceQuantity ?? 0),
                varianceValue: Number(agg._sum.varianceValue ?? 0),
            },
        }
    }
}
