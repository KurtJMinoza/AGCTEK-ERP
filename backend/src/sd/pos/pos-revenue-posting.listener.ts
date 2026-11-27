import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { FicoSdAccountingBridgeService } from '../../fico/fico-sd-accounting-bridge.service'
import { SD_EVENTS } from '../sd-event.types'
import { unwrapSdEventPayload } from '../sd-event-envelope'

const Decimal = Prisma.Decimal

type PosSaleEvent = {
    salesOrderId: string
    orderNumber: string
    receiptNumber?: string
    companyId: string
    customerId?: string
    branchId?: string
    posSessionId?: string
    currency?: string
    totalAmount: string
    taxAmount?: string
    outstandingBalance?: string
    paymentStatus?: string
    tenders?: Array<{
        method: string
        amount: string
        status?: string
        verificationStatus?: string
    }>
}

type PosCollectionEvent = {
    collectionId: string
    collectionNumber: string
    salesOrderId: string
    orderNumber: string
    receiptNumber?: string
    companyId: string
    branchId?: string
    customerId: string
    currency?: string
    collectedAmount: string
    previousBalance: string
    newBalance: string
    tenders?: Array<{
        method: string
        amount: string
        status?: string
        verificationStatus?: string
        referenceNumber?: string
    }>
    idempotencyKey?: string
}

type PosVoidEvent = {
    salesOrderId: string
    orderNumber: string
    companyId: string
    voidReason?: string
    totalAmount?: string
    idempotencyKey?: string
}

type PosDepositEvent = {
    depositId: string
    reference: string
    companyId: string
    customerId: string
    depositAmount: string
    currency?: string
    tenders?: Array<{ method: string; amount: string }>
    idempotencyKey?: string
}

type PosRefundEvent = {
    salesOrderId: string
    orderNumber: string
    companyId: string
    customerId?: string | null
    refundNumber: string
    totalAmount: string
    taxAmount?: string
    tenders?: Array<{ method: string; amount: string }>
    idempotencyKey?: string
}

/**
 * POS financial integration — durable accounting events + centralized FICO
 * posting (account determination rules, company defaults, payment-method G/L).
 * Inventory COGS remains on MM goods issue; this listener posts revenue/tax/AR
 * and payment clearing only.
 */
@Injectable()
export class PosRevenuePostingListener {
    private readonly logger = new Logger(PosRevenuePostingListener.name)

    constructor(private readonly accounting: FicoSdAccountingBridgeService) {}

    @OnEvent(SD_EVENTS.POS_SALE_COMPLETED, { async: true })
    async handlePosSaleCompleted(raw: PosSaleEvent | { payload: PosSaleEvent }): Promise<void> {
        const event = unwrapSdEventPayload<PosSaleEvent>(raw)
        if (!event?.salesOrderId || !event?.companyId) {
            this.logger.warn(
                'PosSaleCompleted ignored — missing salesOrderId or companyId (check SD event envelope).',
            )
            return
        }
        const idempotencyKey = `pos-revenue:${event.salesOrderId}`
        try {
            await this.accounting.recordAndDispatch({
                eventType: 'PosSaleCompleted',
                documentType: 'SALES_ORDER',
                documentId: event.salesOrderId,
                companyId: event.companyId,
                postingDate: new Date(),
                currencyCode: event.currency ?? 'PHP',
                idempotencyKey,
                totalValue: new Decimal(event.totalAmount),
                payload: {
                    salesOrderId: event.salesOrderId,
                    orderNumber: event.orderNumber,
                    receiptNumber: event.receiptNumber,
                    customerId: event.customerId,
                    branchId: event.branchId,
                    posSessionId: event.posSessionId,
                    tenders: event.tenders,
                    outstandingBalance: event.outstandingBalance,
                    totalAmount: event.totalAmount,
                    taxAmount: event.taxAmount,
                    paymentStatus: event.paymentStatus,
                },
            })
        } catch (err) {
            this.logger.error(
                `Revenue accounting event failed for ${event.orderNumber}: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            )
        }
    }

    @OnEvent(SD_EVENTS.POS_COLLECTION_COMPLETED, { async: true })
    async handlePosCollectionCompleted(
        raw: PosCollectionEvent | { payload: PosCollectionEvent },
    ): Promise<void> {
        const event = unwrapSdEventPayload<PosCollectionEvent>(raw)
        if (!event?.collectionId || !event?.companyId) {
            this.logger.warn(
                'PosCollectionCompleted ignored — missing collectionId or companyId.',
            )
            return
        }
        const idempotencyKey =
            event.idempotencyKey ?? `pos-collection:${event.collectionId}`
        try {
            await this.accounting.recordAndDispatch({
                eventType: 'PosCollectionCompleted',
                documentType: 'POS_COLLECTION',
                documentId: event.collectionId,
                companyId: event.companyId,
                postingDate: new Date(),
                currencyCode: event.currency ?? 'PHP',
                idempotencyKey,
                totalValue: new Decimal(event.collectedAmount),
                payload: {
                    collectionNumber: event.collectionNumber,
                    orderNumber: event.orderNumber,
                    salesOrderId: event.salesOrderId,
                    customerId: event.customerId,
                    branchId: event.branchId,
                    collectedAmount: event.collectedAmount,
                    tenders: event.tenders,
                },
            })
        } catch (err) {
            this.logger.error(
                `Collection accounting event failed for ${event.collectionNumber}: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            )
        }
    }

    @OnEvent(SD_EVENTS.POS_CUSTOMER_DEPOSIT, { async: true })
    async handlePosCustomerDeposit(
        raw: PosDepositEvent | { payload: PosDepositEvent },
    ): Promise<void> {
        const event = unwrapSdEventPayload<PosDepositEvent>(raw)
        if (!event?.depositId || !event?.companyId || !event?.customerId) return
        const idempotencyKey =
            (event.idempotencyKey as string | undefined) ??
            `pos-deposit:${event.depositId}`
        try {
            await this.accounting.recordAndDispatch({
                eventType: 'PosCustomerDepositCompleted',
                documentType: 'CUSTOMER_DEPOSIT',
                documentId: event.depositId as string,
                companyId: event.companyId as string,
                postingDate: new Date(),
                currencyCode: (event.currency as string | undefined) ?? 'PHP',
                idempotencyKey,
                totalValue: new Decimal(String(event.depositAmount ?? '0')),
                payload: {
                    depositId: event.depositId,
                    reference: event.reference,
                    customerId: event.customerId,
                    depositAmount: event.depositAmount,
                    tenders: event.tenders,
                },
            })
        } catch (err) {
            this.logger.error(
                `Customer deposit accounting failed for ${event.reference}: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            )
        }
    }

    @OnEvent(SD_EVENTS.POS_SALE_REFUNDED, { async: true })
    async handlePosSaleRefunded(
        raw: PosRefundEvent | { payload: PosRefundEvent },
    ): Promise<void> {
        const event = unwrapSdEventPayload<PosRefundEvent>(raw)
        if (!event?.salesOrderId || !event?.companyId) return
        const idempotencyKey =
            (event.idempotencyKey as string | undefined) ??
            `pos-refund:${event.refundNumber ?? event.salesOrderId}`
        try {
            await this.accounting.recordAndDispatch({
                eventType: 'PosSaleRefunded',
                documentType: 'POS_REFUND',
                documentId: String(event.refundNumber ?? event.salesOrderId),
                companyId: event.companyId as string,
                postingDate: new Date(),
                currencyCode: 'PHP',
                idempotencyKey,
                totalValue: new Decimal(String(event.totalAmount ?? '0')),
                payload: {
                    salesOrderId: event.salesOrderId,
                    orderNumber: event.orderNumber,
                    customerId: event.customerId,
                    totalAmount: event.totalAmount,
                    taxAmount: event.taxAmount,
                    tenders: event.tenders,
                    refundNumber: event.refundNumber,
                },
            })
        } catch (err) {
            this.logger.error(
                `Refund accounting event failed for ${event.orderNumber}: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            )
        }
    }

    @OnEvent(SD_EVENTS.POS_SALE_VOIDED, { async: true })
    async handlePosSaleVoided(raw: PosVoidEvent | { payload: PosVoidEvent }): Promise<void> {
        const event = unwrapSdEventPayload<PosVoidEvent>(raw)
        if (!event?.salesOrderId || !event?.companyId) {
            this.logger.warn(
                'PosSaleVoided ignored — missing salesOrderId or companyId.',
            )
            return
        }
        const voidKey = event.idempotencyKey ?? `void:${event.salesOrderId}`
        try {
            await this.accounting.reversePosRevenueJournal(
                event.companyId,
                event.salesOrderId,
                event.voidReason?.trim() || 'POS sale void',
                voidKey,
            )
        } catch (err) {
            this.logger.error(
                `Void accounting failed for ${event.orderNumber}: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            )
        }
    }
}