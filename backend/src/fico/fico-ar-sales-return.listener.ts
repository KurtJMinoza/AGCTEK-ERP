import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { SD_EVENTS } from '../sd/sd-event.types'
import { FicoSdAccountingBridgeService } from './fico-sd-accounting-bridge.service'

type SalesReturnCreditPayload = {
    salesReturnId: string
    returnNumber: string
    salesOrderId: string
    companyId: string
    customerId: string
    creditAmount: string
    idempotencyKey: string
}

@Injectable()
export class FicoArSalesReturnListener {
    private readonly logger = new Logger(FicoArSalesReturnListener.name)

    constructor(private readonly accounting: FicoSdAccountingBridgeService) {}

    @OnEvent(SD_EVENTS.SALES_RETURN_CREDIT_AUTHORIZED, { async: true })
    async handleSalesReturnCredit(
        raw:
            | SalesReturnCreditPayload
            | { payload: SalesReturnCreditPayload },
    ): Promise<void> {
        const event =
            raw && typeof raw === 'object' && 'payload' in raw
                ? (raw as { payload: SalesReturnCreditPayload }).payload
                : (raw as SalesReturnCreditPayload)
        if (!event?.salesReturnId || !event.companyId || !event.customerId) return
        try {
            await this.accounting.recordAndDispatch({
                eventType: 'SdSalesReturnCreditMemo',
                documentType: 'SALES_RETURN',
                documentId: event.salesReturnId,
                companyId: event.companyId,
                postingDate: new Date(),
                currencyCode: 'PHP',
                idempotencyKey: event.idempotencyKey,
                totalValue: new Prisma.Decimal(event.creditAmount),
                payload: {
                    salesReturnId: event.salesReturnId,
                    returnNumber: event.returnNumber,
                    salesOrderId: event.salesOrderId,
                    customerId: event.customerId,
                    creditAmount: event.creditAmount,
                },
            })
        } catch (err) {
            this.logger.error(
                `Sales return credit posting failed for ${event.returnNumber}: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            )
        }
    }
}