import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { SD_EVENTS, type SdSalesInvoicePaidPayload } from '../../sd/sd-event.types'
import { CrmLoyaltyService } from './loyalty.service'

/**
 * Paid SD invoice → loyalty EARN (once per sales order). Errors propagate to SD's emitter, which
 * logs them and leaves the outbox row PENDING; the payment itself is never failed by loyalty.
 */
@Injectable()
export class CrmLoyaltyEarnListener {
    constructor(private readonly loyalty: CrmLoyaltyService) {}

    @OnEvent(SD_EVENTS.SALES_INVOICE_PAID, { suppressErrors: false })
    async onInvoicePaid(envelope: { payload: SdSalesInvoicePaidPayload }) {
        await this.loyalty.earnForPaidInvoice(envelope.payload)
    }
}
