import { Injectable } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'

export type FulfillmentLineDraft = {
    salesOrderLineId: string
    productId?: string | null
    materialId: string
    salesQty: Decimal
    salesUomId?: string | null
    baseQty: Decimal
    baseUomId: string
}

@Injectable()
export class SdFulfillmentService {
    constructor(private prisma: PrismaService) {}

    /** Upsert fulfillments grouped by warehouse (supports split fulfillment). */
    async syncFulfillmentsForOrder(args: {
        salesOrderId: string
        companyId: string
        warehouseId: string
        lines: FulfillmentLineDraft[]
    }) {
        let fulfillment = await this.prisma.sdFulfillment.findFirst({
            where: {
                salesOrderId: args.salesOrderId,
                warehouseId: args.warehouseId,
                status: { in: ['OPEN', 'CONFIRMED'] },
            },
        })
        if (!fulfillment) {
            fulfillment = await this.prisma.sdFulfillment.create({
                data: {
                    salesOrderId: args.salesOrderId,
                    companyId: args.companyId,
                    warehouseId: args.warehouseId,
                    status: 'OPEN',
                },
            })
        }

        for (const line of args.lines) {
            const existing = await this.prisma.sdFulfillmentLine.findFirst({
                where: {
                    fulfillmentId: fulfillment.id,
                    salesOrderLineId: line.salesOrderLineId,
                },
            })
            if (existing) {
                await this.prisma.sdFulfillmentLine.update({
                    where: { id: existing.id },
                    data: {
                        productId: line.productId ?? null,
                        materialId: line.materialId,
                        salesQty: line.salesQty,
                        salesUomId: line.salesUomId ?? null,
                        baseQty: line.baseQty,
                        baseUomId: line.baseUomId,
                    },
                })
            } else {
                await this.prisma.sdFulfillmentLine.create({
                    data: {
                        fulfillmentId: fulfillment.id,
                        salesOrderLineId: line.salesOrderLineId,
                        productId: line.productId ?? null,
                        materialId: line.materialId,
                        salesQty: line.salesQty,
                        salesUomId: line.salesUomId ?? null,
                        baseQty: line.baseQty,
                        baseUomId: line.baseUomId,
                    },
                })
            }
        }

        return fulfillment
    }
}
