import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { CostLayerQueryDto } from './dto/valuation.dto'
import { Prisma } from '@prisma/client'

export type LayerConsumption = {
    layerId: string
    qty: string
    unitCost: string
}

@Injectable()
export class CostLayerService {
    constructor(private prisma: PrismaService) {}

    async findAll(query: CostLayerQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 50
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.materialId) where.materialId = query.materialId
        if (query.status) where.status = query.status

        const [data, total] = await Promise.all([
            this.prisma.mmCostLayer.findMany({
                where,
                include: { material: true, warehouse: true },
                orderBy: [{ postingDate: 'asc' }, { createdAt: 'asc' }],
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmCostLayer.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async createLayer(
        tx: Prisma.TransactionClient,
        data: {
            companyId: string
            materialId: string
            warehouseId: string
            batchId?: string | null
            receiptTxnId: string
            receiptDocumentId?: string | null
            quantity: Decimal
            unitCost: Decimal
            postingDate: Date
        },
    ) {
        return tx.mmCostLayer.create({
            data: {
                companyId: data.companyId,
                materialId: data.materialId,
                warehouseId: data.warehouseId,
                batchId: data.batchId ?? null,
                receiptTxnId: data.receiptTxnId,
                receiptDocumentId: data.receiptDocumentId ?? null,
                originalQuantity: data.quantity,
                remainingQuantity: data.quantity,
                unitCost: data.unitCost,
                postingDate: data.postingDate,
                status: 'OPEN',
            },
        })
    }

    /**
     * Consume oldest OPEN layers (FIFO). Returns consumptions and weighted unit cost.
     */
    async consumeFifo(
        tx: Prisma.TransactionClient,
        params: {
            companyId: string
            materialId: string
            warehouseId: string
            batchId?: string | null
            quantity: Decimal
        },
    ): Promise<{ consumptions: LayerConsumption[]; unitCost: Decimal; totalCost: Decimal }> {
        const layers = await tx.mmCostLayer.findMany({
            where: {
                companyId: params.companyId,
                materialId: params.materialId,
                warehouseId: params.warehouseId,
                batchId: params.batchId ?? null,
                status: 'OPEN',
                remainingQuantity: { gt: 0 },
            },
            orderBy: [{ postingDate: 'asc' }, { createdAt: 'asc' }],
        })

        let remaining = new Decimal(params.quantity)
        const consumptions: LayerConsumption[] = []
        let totalCost = new Decimal(0)

        for (const layer of layers) {
            if (remaining.lte(0)) break
            const avail = new Decimal(layer.remainingQuantity)
            const take = Decimal.min(avail, remaining)
            const layerCost = new Decimal(layer.unitCost)
            totalCost = totalCost.plus(take.mul(layerCost))
            consumptions.push({
                layerId: layer.id,
                qty: take.toString(),
                unitCost: layerCost.toString(),
            })

            const newRemaining = avail.minus(take)
            await tx.mmCostLayer.update({
                where: { id: layer.id },
                data: {
                    remainingQuantity: newRemaining,
                    status: newRemaining.lte(0) ? 'DEPLETED' : 'OPEN',
                },
            })
            remaining = remaining.minus(take)
        }

        if (remaining.gt(0)) {
            throw new BadRequestException(
                `Insufficient FIFO cost layers. Short by ${remaining.toString()}`,
            )
        }

        const unitCost = params.quantity.gt(0)
            ? totalCost.div(params.quantity)
            : new Decimal(0)

        return { consumptions, unitCost, totalCost }
    }

    /**
     * Restore layer quantities from a valuation consumption snapshot (reversal).
     * Never deletes layers.
     */
    async restoreConsumptions(
        tx: Prisma.TransactionClient,
        consumptions: LayerConsumption[],
    ) {
        for (const c of consumptions) {
            const layer = await tx.mmCostLayer.findUnique({
                where: { id: c.layerId },
            })
            if (!layer) continue
            if (layer.status === 'REVERSED') continue

            const qty = new Decimal(c.qty)
            const newRemaining = new Decimal(layer.remainingQuantity).plus(qty)
            const capped = Decimal.min(
                newRemaining,
                new Decimal(layer.originalQuantity),
            )
            await tx.mmCostLayer.update({
                where: { id: layer.id },
                data: {
                    remainingQuantity: capped,
                    status: capped.gt(0) ? 'OPEN' : 'DEPLETED',
                },
            })
        }
    }

    async markReceiptLayerReversed(
        tx: Prisma.TransactionClient,
        receiptTxnId: string,
    ) {
        const layers = await tx.mmCostLayer.findMany({
            where: { receiptTxnId },
        })
        for (const layer of layers) {
            await tx.mmCostLayer.update({
                where: { id: layer.id },
                data: {
                    remainingQuantity: 0,
                    status: 'REVERSED',
                },
            })
        }
    }
}
