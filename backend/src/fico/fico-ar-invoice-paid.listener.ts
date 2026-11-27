import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { SD_EVENTS, type SdSalesInvoicePaidPayload } from '../sd/sd-event.types'
import { FicoSdAccountingBridgeService } from './fico-sd-accounting-bridge.service'

/**
 * When an issued invoice is settled (ISSUED → PAID), clear customer receivables
 * without posting duplicate revenue.
 */
@Injectable()
export class FicoArInvoicePaidListener {
    private readonly logger = new Logger(FicoArInvoicePaidListener.name)

    constructor(private readonly accounting: FicoSdAccountingBridgeService) {}

    @OnEvent(SD_EVENTS.SALES_INVOICE_PAID, { async: true })
    async handleInvoicePaid(
        raw:
            | SdSalesInvoicePaidPayload
            | { payload: SdSalesInvoicePaidPayload },
    ): Promise<void> {
        const event =
            raw && typeof raw === 'object' && 'payload' in raw
                ? (raw as { payload: SdSalesInvoicePaidPayload }).payload
                : (raw as SdSalesInvoicePaidPayload)
        if (!event?.salesInvoiceId || !event.companyId || !event.customerId) return

        const idempotencyKey = `sd-invoice-paid:${event.salesInvoiceId}`
        try {
            await this.accounting.recordAndDispatch({
                eventType: 'SdCustomerCollection',
                documentType: 'SALES_INVOICE',
                documentId: event.salesInvoiceId,
                companyId: event.companyId,
                postingDate: new Date(event.paidAt),
                currencyCode: event.currency,
                idempotencyKey,
                totalValue: new Prisma.Decimal(event.totalAmount),
                payload: {
                    salesInvoiceId: event.salesInvoiceId,
                    invoiceNumber: event.invoiceNumber,
                    salesOrderId: event.salesOrderId,
                    customerId: event.customerId,
                    collectedAmount: event.totalAmount,
                    settlementKind: 'INVOICE_PAID',
                },
            })
        } catch (err) {
            this.logger.error(
                `Invoice paid collection dispatch failed for ${event.invoiceNumber}: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            )
        }
    }
}