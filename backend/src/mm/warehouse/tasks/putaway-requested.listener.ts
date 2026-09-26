import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { MM_DOMAIN_EVENTS } from '../../common/mm-domain-events.types'
import { PutawayService } from '../putaway/putaway.service'

@Injectable()
export class PutawayRequestedListener {
    constructor(private putaway: PutawayService) {}

    @OnEvent(MM_DOMAIN_EVENTS.PUTAWAY_REQUESTED)
    async handle(event: {
        companyId: string
        payload: {
            warehouseId: string
            materialId: string
            quantity: number
            storageBinId?: string
            goodsReceiptLineId?: string
            stockStatus?: string
        }
    }) {
        const p = event.payload
        if (!p.warehouseId || !p.materialId || !p.quantity) return

        await this.putaway.createFromEvent({
            companyId: event.companyId,
            warehouseId: p.warehouseId,
            materialId: p.materialId,
            quantity: p.quantity,
            sourceBinId: p.storageBinId,
            goodsReceiptLineId: p.goodsReceiptLineId,
            stockStatus: p.stockStatus ?? 'UNRESTRICTED',
        })
    }
}
