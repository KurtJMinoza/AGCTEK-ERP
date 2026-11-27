import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { FicoSdAccountingBridgeService } from './fico-sd-accounting-bridge.service'

type SdSalesInvoiceIssuedPayload = {
    salesInvoiceId: string
    invoiceNumber: string
    salesOrderId: string
    customerId: string
    companyId: string
    currency: string
    totalAmount: string
    issuedAt: string
    idempotencyKey: string
}

import { FICO_AR_EVENTS } from './fico-ar.constants'

@Injectable()
export class FicoArSalesInvoiceListener {
    private readonly logger = new Logger(FicoArSalesInvoiceListener.name)

    constructor(private readonly accounting: FicoSdAccountingBridgeService) {}

    @OnEvent(FICO_AR_EVENTS.SALES_INVOICE_ISSUED, { async: true })
    async handleSalesInvoiceIssued(
        raw: SdSalesInvoiceIssuedPayload | { payload: SdSalesInvoiceIssuedPayload },
    ): Promise<void> {
        const event =
            raw && typeof raw === 'object' && 'payload' in raw
                ? (raw as { payload: SdSalesInvoiceIssuedPayload }).payload
                : (raw as SdSalesInvoiceIssuedPayload)
        if (!event?.salesInvoiceId || !event.companyId) return
        try {
            await this.accounting.dispatchSalesInvoicePosted({
                eventType: 'SdSalesInvoicePosted',
                documentType: 'SALES_INVOICE',
                documentId: event.salesInvoiceId,
                companyId: event.companyId,
                postingDate: new Date(event.issuedAt),
                currencyCode: event.currency,
                idempotencyKey: event.idempotencyKey,
                totalValue: new Prisma.Decimal(event.totalAmount),
                payload: {
                    salesInvoiceId: event.salesInvoiceId,
                    invoiceNumber: event.invoiceNumber,
                    salesOrderId: event.salesOrderId,
                    customerId: event.customerId,
                    totalAmount: event.totalAmount,
                },
            })
        } catch (err) {
            this.logger.error(
                `AR invoice posting dispatch failed for ${event.invoiceNumber}: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            )
        }
    }
}