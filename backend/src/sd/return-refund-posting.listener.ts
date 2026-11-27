import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { FicoSdAccountingBridgeService } from '../fico/fico-sd-accounting-bridge.service'
import { SD_EVENTS } from './sd-event.types'
import { unwrapSdEventPayload } from './sd-event-envelope'

const Decimal = Prisma.Decimal

export type SdSalesReturnRefundPaidPayload = {
    returnRequestId: string
    requestNumber: string
    refundId: string
    refundNumber: string
    creditMemoId?: string | null
    creditMemoNumber?: string | null
    salesOrderId: string
    orderNumber?: string
    companyId: string
    customerId: string
    currency?: string
    /** Gross commercial refund (includes tax when tax was in selling price). */
    totalAmount: string
    /** Output tax portion when available; otherwise "0". */
    taxAmount?: string
    refundMethod?: string | null
    /** Original tender / payment method used to settle the sale. */
    originalPaymentMethod?: string | null
    preferredResolution?: string | null
    refundStatus: string
    idempotencyKey: string
}

/**
 * SD refund PAID → durable accounting event → FICO commercial journal
 * (Dr Revenue [+ tax] / Cr Cash|AR). Inventory restock journals stay on MM.
 */
@Injectable()
export class ReturnRefundPostingListener {
    private readonly logger = new Logger(ReturnRefundPostingListener.name)

    constructor(private readonly accounting: FicoSdAccountingBridgeService) {}

    @OnEvent(SD_EVENTS.RETURN_REFUND_PAID, { async: true })
    async handleRefundPaid(
        raw:
            | SdSalesReturnRefundPaidPayload
            | { payload: SdSalesReturnRefundPaidPayload },
    ): Promise<void> {
        const event = unwrapSdEventPayload<SdSalesReturnRefundPaidPayload>(raw)
        if (!event?.returnRequestId || !event?.companyId || !event?.refundId) {
            this.logger.warn(
                'ReturnRefundPaid ignored — missing returnRequestId, companyId, or refundId.',
            )
            return
        }
        if (
            event.preferredResolution === 'REPLACEMENT' ||
            event.refundStatus === 'NOT_REQUIRED'
        ) {
            const skipReason =
                event.preferredResolution === 'REPLACEMENT'
                    ? 'REPLACEMENT'
                    : event.refundStatus
            this.logger.debug(
                `Skip commercial return journal for ${event.requestNumber} (${skipReason}).`,
            )
            return
        }

        const idempotencyKey =
            event.idempotencyKey ||
            `sales-return-refund:${event.returnRequestId}:${event.refundId}`

        try {
            await this.accounting.recordAndDispatch({
                eventType: 'SdSalesReturnRefundPaid',
                documentType: 'RETURN_REQUEST',
                documentId: event.returnRequestId,
                companyId: event.companyId,
                postingDate: new Date(),
                currencyCode: event.currency ?? 'PHP',
                idempotencyKey,
                totalValue: new Decimal(event.totalAmount),
                payload: {
                    returnRequestId: event.returnRequestId,
                    requestNumber: event.requestNumber,
                    refundId: event.refundId,
                    refundNumber: event.refundNumber,
                    creditMemoId: event.creditMemoId ?? null,
                    creditMemoNumber: event.creditMemoNumber ?? null,
                    salesOrderId: event.salesOrderId,
                    orderNumber: event.orderNumber,
                    customerId: event.customerId,
                    totalAmount: event.totalAmount,
                    taxAmount: event.taxAmount ?? '0',
                    refundMethod: event.refundMethod ?? null,
                    originalPaymentMethod: event.originalPaymentMethod ?? null,
                },
            })
        } catch (err) {
            this.logger.error(
                `Sales return refund accounting failed for ${event.requestNumber}: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            )
        }
    }
}
