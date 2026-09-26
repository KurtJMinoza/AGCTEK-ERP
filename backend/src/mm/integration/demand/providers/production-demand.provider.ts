import { Injectable } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../../../prisma/prisma.service'
import type { MmDemandProvider } from '../mm-demand-provider.port'
import {
    MM_DEMAND_MODULES,
    type MmDemandQuery,
    type MmNormalizedDemandLine,
} from '../mm-demand.types'
import {
    buildDemandReferenceKey,
    demandSourceTypeFromModule,
} from '../mm-demand.util'

@Injectable()
export class ProductionDemandProvider implements MmDemandProvider {
    readonly moduleId = MM_DEMAND_MODULES.PRODUCTION

    constructor(private prisma: PrismaService) {}

    async listOpenDemand(query: MmDemandQuery): Promise<MmNormalizedDemandLine[]> {
        const orders = await this.prisma.ppProductionOrder.findMany({
            where: {
                companyId: query.companyId,
                status: 'RELEASED',
                warehouseId: { in: query.warehouseIds },
                materials: {
                    some: {
                        materialId: { in: query.materialIds },
                        integrationStatus: { notIn: ['ISSUED', 'CANCELLED'] },
                    },
                },
            },
            include: {
                materials: {
                    where: {
                        materialId: { in: query.materialIds },
                        integrationStatus: { notIn: ['ISSUED', 'CANCELLED'] },
                    },
                    include: {
                        material: { select: { baseUomId: true } },
                    },
                },
            },
        })

        const lines: MmNormalizedDemandLine[] = []
        for (const order of orders) {
            for (const mat of order.materials) {
                const openQty = new Decimal(mat.requiredQuantity).minus(
                    mat.issuedQuantity,
                )
                if (openQty.lte(0)) continue

                lines.push({
                    sourceModule: this.moduleId,
                    sourceDocumentType: 'PRODUCTION_ORDER',
                    sourceDocumentId: order.id,
                    sourceDocumentLineId: mat.id,
                    companyId: order.companyId,
                    materialId: mat.materialId,
                    warehouseId: order.warehouseId,
                    plantId: order.plantId,
                    requiredDate: query.asOf,
                    quantity: Number(openQty),
                    uomId: mat.material.baseUomId,
                    priority: 40,
                    status: 'OPEN',
                    demandReferenceKey: buildDemandReferenceKey(
                        this.moduleId,
                        'PRODUCTION_ORDER',
                        order.id,
                        mat.id,
                    ),
                    sourceType: demandSourceTypeFromModule(this.moduleId),
                })
            }
        }

        return lines
    }
}
