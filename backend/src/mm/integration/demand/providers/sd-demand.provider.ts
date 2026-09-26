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
export class SdDemandProvider implements MmDemandProvider {
    readonly moduleId = MM_DEMAND_MODULES.SD

    constructor(private prisma: PrismaService) {}

    async listOpenDemand(query: MmDemandQuery): Promise<MmNormalizedDemandLine[]> {
        const orders = await this.prisma.sdSalesOrder.findMany({
            where: {
                companyId: query.companyId,
                status: 'CONFIRMED',
                warehouseId: { in: query.warehouseIds },
                lines: {
                    some: {
                        materialId: { in: query.materialIds },
                        integrationStatus: { notIn: ['FULFILLED', 'CANCELLED'] },
                    },
                },
            },
            include: {
                warehouse: { select: { plantId: true } },
                lines: {
                    where: {
                        materialId: { in: query.materialIds },
                        integrationStatus: { notIn: ['FULFILLED', 'CANCELLED'] },
                    },
                    include: {
                        material: { select: { baseUomId: true } },
                    },
                },
            },
        })

        const lines: MmNormalizedDemandLine[] = []
        for (const order of orders) {
            for (const line of order.lines) {
                const openQty = new Decimal(line.quantity).minus(line.issuedQuantity)
                if (openQty.lte(0)) continue

                const demandReferenceKey = buildDemandReferenceKey(
                    this.moduleId,
                    'SALES_ORDER',
                    order.id,
                    line.id,
                )

                lines.push({
                    sourceModule: this.moduleId,
                    sourceDocumentType: 'SALES_ORDER',
                    sourceDocumentId: order.id,
                    sourceDocumentLineId: line.id,
                    companyId: order.companyId,
                    materialId: line.materialId,
                    warehouseId: order.warehouseId,
                    plantId: order.warehouse?.plantId ?? null,
                    requiredDate: query.asOf,
                    quantity: Number(openQty),
                    uomId: line.material.baseUomId,
                    priority: 50,
                    status: 'OPEN',
                    demandReferenceKey,
                    sourceType: demandSourceTypeFromModule(this.moduleId),
                })
            }
        }

        return lines.filter(
            (l) =>
                l.requiredDate >= query.asOf && l.requiredDate <= query.horizonEnd,
        )
    }
}
