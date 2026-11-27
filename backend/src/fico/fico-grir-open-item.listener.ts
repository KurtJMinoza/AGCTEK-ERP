import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import { FicoGrIrOpenItemService } from './fico-grir-open-item.service'

type LegacyDomainPayload = {
    documentId?: string
    goodsReceiptId?: string
    sourceEntityId?: string
    returnId?: string
}

@Injectable()
export class FicoGrIrOpenItemListener {
    private readonly logger = new Logger(FicoGrIrOpenItemListener.name)

    constructor(
        private readonly grir: FicoGrIrOpenItemService,
        private readonly prisma: PrismaService,
    ) {}

    @OnEvent('GoodsReceiptPosted', { async: true })
    async onGoodsReceiptPosted(payload: LegacyDomainPayload): Promise<void> {
        const goodsReceiptId =
            payload?.goodsReceiptId ??
            payload?.documentId ??
            payload?.sourceEntityId
        if (!goodsReceiptId) return
        try {
            await this.grir.syncFromGoodsReceipt(goodsReceiptId)
        } catch (error) {
            this.logger.warn(
                `GR/IR open-item sync failed for GR ${goodsReceiptId}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            )
        }
    }

    @OnEvent('GoodsReceiptReversed', { async: true })
    async onGoodsReceiptReversed(payload: LegacyDomainPayload): Promise<void> {
        const goodsReceiptId =
            payload?.goodsReceiptId ??
            payload?.documentId ??
            payload?.sourceEntityId
        if (!goodsReceiptId) return
        await this.grir.markReceiptReversed(goodsReceiptId)
    }

    @OnEvent('SupplierReturnPosted', { async: true })
    async onSupplierReturnPosted(payload: LegacyDomainPayload): Promise<void> {
        const returnId =
            payload?.returnId ?? payload?.documentId ?? payload?.sourceEntityId
        if (!returnId) return
        const lines = await this.prisma.mmSupplierReturnLine.findMany({
            where: {
                returnId,
                goodsReceiptLineId: { not: null },
            },
            select: {
                goodsReceiptLineId: true,
                quantity: true,
                unitCost: true,
            },
        })
        for (const line of lines) {
            if (!line.goodsReceiptLineId) continue
            await this.grir.applySupplierReturnLine({
                goodsReceiptLineId: line.goodsReceiptLineId,
                quantity: new Decimal(line.quantity),
                unitCost: new Decimal(line.unitCost),
            })
        }
    }
}