import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
    MM_DOMAIN_EVENTS,
    type MmDomainEventPayload,
    type MmDomainEventType,
} from './mm-domain-events.types'
import { envelopeToLegacyPayload } from './mm-integration-event.builder'
import type {
    MmIntegrationEventEnvelope,
    MmIntegrationEventInput,
} from './mm-integration-event.types'
import { MmOutboxService } from './mm-outbox.service'

type TransactionClient = Prisma.TransactionClient

@Injectable()
export class MmDomainEventsService {
    constructor(private outbox: MmOutboxService) {}

    /**
     * Phase 3A integration emit — builds envelope, persists outbox, dispatches in-process.
     * Prefer `emitInTransaction` when inside a business transaction.
     */
    async emitIntegration(
        input: MmIntegrationEventInput,
    ): Promise<MmIntegrationEventEnvelope> {
        const envelope = this.outbox.buildEnvelope(input)
        await this.outbox.persistStandalone(envelope)
        this.outbox.dispatchInProcess(envelope)
        return envelope
    }

    /** Atomic business write + outbox within the same DB transaction. */
    async emitInTransaction(
        tx: TransactionClient,
        input: MmIntegrationEventInput,
    ): Promise<MmIntegrationEventEnvelope> {
        const envelope = this.outbox.buildEnvelope(input)
        await this.outbox.persistInTransaction(tx, envelope)
        return envelope
    }

    /** Dispatch in-process after transaction commit (call from domain service). */
    dispatchAfterCommit(envelope: MmIntegrationEventEnvelope): void {
        this.outbox.dispatchInProcess(envelope)
    }

    /** Legacy emit — maps to integration envelope; preserves existing call sites. */
    async emit(event: MmDomainEventPayload): Promise<void> {
        const envelope = this.outbox.buildEnvelope({
            eventType: event.eventType,
            companyId: event.companyId,
            sourceModule: event.sourceModule,
            sourceEntityType: event.documentType,
            sourceEntityId: event.documentId,
            payload: event.payload,
            correlationId:
                typeof event.payload.correlationId === 'string'
                    ? event.payload.correlationId
                    : undefined,
            causationId:
                typeof event.payload.causationId === 'string'
                    ? event.payload.causationId
                    : null,
            actorId:
                typeof event.payload.actorId === 'string'
                    ? event.payload.actorId
                    : null,
            plantId:
                typeof event.payload.plantId === 'string'
                    ? event.payload.plantId
                    : null,
            documentReferences: Array.isArray(event.payload.documentReferences)
                ? (event.payload.documentReferences as MmIntegrationEventInput['documentReferences'])
                : undefined,
            occurredAt: event.occurredAt,
        })
        await this.outbox.persistStandalone(envelope)
        this.outbox.dispatchInProcess(envelope)
    }

    goodsReceiptPosted(args: {
        companyId: string
        goodsReceiptId: string
        payload: Record<string, unknown>
        correlationId?: string
        causationId?: string | null
        actorId?: string | null
        plantId?: string | null
        documentReferences?: MmIntegrationEventInput['documentReferences']
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.GOODS_RECEIPT_POSTED,
            companyId: args.companyId,
            sourceModule: 'STOCK_OPS',
            sourceEntityType: 'GOODS_RECEIPT',
            sourceEntityId: args.goodsReceiptId,
            payload: args.payload,
            correlationId: args.correlationId,
            causationId: args.causationId,
            actorId: args.actorId,
            plantId: args.plantId,
            documentReferences: args.documentReferences,
        })
    }

    goodsIssuePosted(args: {
        companyId: string
        goodsIssueId: string
        payload: Record<string, unknown>
        correlationId?: string
        causationId?: string | null
        actorId?: string | null
        plantId?: string | null
        documentReferences?: MmIntegrationEventInput['documentReferences']
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.GOODS_ISSUE_POSTED,
            companyId: args.companyId,
            sourceModule: 'STOCK_OPS',
            sourceEntityType: 'GOODS_ISSUE',
            sourceEntityId: args.goodsIssueId,
            payload: args.payload,
            correlationId: args.correlationId,
            causationId: args.causationId,
            actorId: args.actorId,
            plantId: args.plantId,
            documentReferences: args.documentReferences,
        })
    }

    inventoryAdjusted(args: {
        companyId: string
        documentId: string
        payload: Record<string, unknown>
        correlationId?: string
        causationId?: string | null
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.INVENTORY_ADJUSTED,
            companyId: args.companyId,
            sourceModule: String(args.payload.sourceModule ?? 'STOCK_OPS'),
            sourceEntityType: String(args.payload.documentType ?? 'ADJUSTMENT'),
            sourceEntityId: args.documentId,
            payload: args.payload,
            correlationId: args.correlationId,
            causationId: args.causationId,
        })
    }

    inventoryTransactionPosted(args: {
        companyId: string
        transactionId: string
        payload: Record<string, unknown>
        correlationId?: string
        causationId?: string | null
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.INVENTORY_TRANSACTION_POSTED,
            companyId: args.companyId,
            sourceModule: 'INVENTORY',
            sourceEntityType: 'INVENTORY_TRANSACTION',
            sourceEntityId: args.transactionId,
            payload: args.payload,
            correlationId: args.correlationId,
            causationId: args.causationId,
        })
    }

    inventoryTransactionReversed(args: {
        companyId: string
        reversalId: string
        payload: Record<string, unknown>
        correlationId?: string
        causationId?: string | null
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.INVENTORY_TRANSACTION_REVERSED,
            companyId: args.companyId,
            sourceModule: 'INVENTORY',
            sourceEntityType: 'INVENTORY_TRANSACTION',
            sourceEntityId: args.reversalId,
            payload: args.payload,
            correlationId: args.correlationId,
            causationId: args.causationId,
        })
    }

    qualityDecisionMade(args: {
        companyId: string
        inspectionId: string
        payload: Record<string, unknown>
        correlationId?: string
        causationId?: string | null
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.QUALITY_DECISION_MADE,
            companyId: args.companyId,
            sourceModule: 'INBOUND',
            sourceEntityType: 'QUALITY_INSPECTION',
            sourceEntityId: args.inspectionId,
            payload: args.payload,
            correlationId: args.correlationId,
            causationId: args.causationId,
        })
    }

    reservationCreated(args: {
        companyId: string
        reservationId: string
        payload: Record<string, unknown>
        correlationId?: string
        causationId?: string | null
        sourceModule?: string
        sourceEntityType?: string
        sourceEntityId?: string
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.RESERVATION_CREATED,
            companyId: args.companyId,
            sourceModule: args.sourceModule ?? 'INVENTORY',
            sourceEntityType: args.sourceEntityType ?? 'RESERVATION',
            sourceEntityId: args.sourceEntityId ?? args.reservationId,
            payload: args.payload,
            correlationId: args.correlationId,
            causationId: args.causationId,
        })
    }

    reservationReleased(args: {
        companyId: string
        reservationId: string
        payload: Record<string, unknown>
        correlationId?: string
        causationId?: string | null
        sourceModule?: string
        sourceEntityType?: string
        sourceEntityId?: string
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.RESERVATION_RELEASED,
            companyId: args.companyId,
            sourceModule: args.sourceModule ?? 'INVENTORY',
            sourceEntityType: args.sourceEntityType ?? 'RESERVATION',
            sourceEntityId: args.sourceEntityId ?? args.reservationId,
            payload: args.payload,
            correlationId: args.correlationId,
            causationId: args.causationId,
        })
    }

    shortageDetected(args: {
        companyId: string
        sourceEntityId: string
        payload: Record<string, unknown>
        sourceModule?: string
        sourceEntityType?: string
        correlationId?: string
        causationId?: string | null
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.SHORTAGE_DETECTED,
            companyId: args.companyId,
            sourceModule: args.sourceModule ?? 'INVENTORY',
            sourceEntityType: args.sourceEntityType ?? 'SALES_ORDER',
            sourceEntityId: args.sourceEntityId,
            payload: args.payload,
            correlationId: args.correlationId,
            causationId: args.causationId,
        })
    }

    allocationCreated(args: {
        companyId: string
        allocationId: string
        payload: Record<string, unknown>
        sourceModule?: string
        sourceEntityType?: string
        sourceEntityId?: string
        correlationId?: string
        causationId?: string | null
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.ALLOCATION_CREATED,
            companyId: args.companyId,
            sourceModule: args.sourceModule ?? 'INVENTORY',
            sourceEntityType: args.sourceEntityType ?? 'ALLOCATION',
            sourceEntityId: args.sourceEntityId ?? args.allocationId,
            payload: args.payload,
            correlationId: args.correlationId,
            causationId: args.causationId,
        })
    }

    allocationReleased(args: {
        companyId: string
        allocationId: string
        payload: Record<string, unknown>
        sourceModule?: string
        sourceEntityType?: string
        sourceEntityId?: string
        correlationId?: string
        causationId?: string | null
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.ALLOCATION_RELEASED,
            companyId: args.companyId,
            sourceModule: args.sourceModule ?? 'INVENTORY',
            sourceEntityType: args.sourceEntityType ?? 'ALLOCATION',
            sourceEntityId: args.sourceEntityId ?? args.allocationId,
            payload: args.payload,
            correlationId: args.correlationId,
            causationId: args.causationId,
        })
    }

    supplierReturnPosted(args: {
        companyId: string
        returnId: string
        payload: Record<string, unknown>
        correlationId?: string
        causationId?: string | null
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.SUPPLIER_RETURN_POSTED,
            companyId: args.companyId,
            sourceModule: 'RETURNS_DISPOSAL',
            sourceEntityType: 'SUPPLIER_RETURN',
            sourceEntityId: args.returnId,
            payload: args.payload,
            correlationId: args.correlationId,
            causationId: args.causationId,
        })
    }

    inventoryTransferred(args: {
        companyId: string
        documentId: string
        payload: Record<string, unknown>
        correlationId?: string
        causationId?: string | null
        plantId?: string | null
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.INVENTORY_TRANSFERRED,
            companyId: args.companyId,
            sourceModule: String(args.payload.sourceModule ?? 'WAREHOUSE'),
            sourceEntityType: String(args.payload.documentType ?? 'WM_TRANSFER'),
            sourceEntityId: args.documentId,
            payload: args.payload,
            correlationId: args.correlationId,
            causationId: args.causationId,
            plantId: args.plantId,
        })
    }

    disposalPosted(args: {
        companyId: string
        disposalId: string
        payload: Record<string, unknown>
        correlationId?: string
        causationId?: string | null
        plantId?: string | null
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.DISPOSAL_POSTED,
            companyId: args.companyId,
            sourceModule: 'RETURNS_DISPOSAL',
            sourceEntityType: 'DISPOSAL',
            sourceEntityId: args.disposalId,
            payload: args.payload,
            correlationId: args.correlationId,
            causationId: args.causationId,
            plantId: args.plantId,
        })
    }

    scrapPosted(args: {
        companyId: string
        scrapId: string
        payload: Record<string, unknown>
        correlationId?: string
        causationId?: string | null
        plantId?: string | null
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.SCRAP_POSTED,
            companyId: args.companyId,
            sourceModule: 'RETURNS_DISPOSAL',
            sourceEntityType: 'SCRAP',
            sourceEntityId: args.scrapId,
            payload: args.payload,
            correlationId: args.correlationId,
            causationId: args.causationId,
            plantId: args.plantId,
        })
    }

    disposalReversed(args: {
        companyId: string
        disposalId: string
        payload: Record<string, unknown>
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.DISPOSAL_REVERSED,
            companyId: args.companyId,
            sourceModule: 'RETURNS_DISPOSAL',
            sourceEntityType: 'DISPOSAL',
            sourceEntityId: args.disposalId,
            payload: args.payload,
        })
    }

    supplierReturnReversed(args: {
        companyId: string
        returnId: string
        payload: Record<string, unknown>
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.SUPPLIER_RETURN_REVERSED,
            companyId: args.companyId,
            sourceModule: 'RETURNS_DISPOSAL',
            sourceEntityType: 'SUPPLIER_RETURN',
            sourceEntityId: args.returnId,
            payload: args.payload,
        })
    }

    goodsReceiptReversed(args: {
        companyId: string
        goodsReceiptId: string
        payload: Record<string, unknown>
        plantId?: string | null
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.GOODS_RECEIPT_REVERSED,
            companyId: args.companyId,
            sourceModule: 'STOCK_OPS',
            sourceEntityType: 'GOODS_RECEIPT',
            sourceEntityId: args.goodsReceiptId,
            payload: args.payload,
            plantId: args.plantId,
        })
    }

    goodsIssueReversed(args: {
        companyId: string
        goodsIssueId: string
        payload: Record<string, unknown>
        plantId?: string | null
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.GOODS_ISSUE_REVERSED,
            companyId: args.companyId,
            sourceModule: 'STOCK_OPS',
            sourceEntityType: 'GOODS_ISSUE',
            sourceEntityId: args.goodsIssueId,
            payload: args.payload,
            plantId: args.plantId,
        })
    }

    landedCostAllocated(args: {
        companyId: string
        landedCostId: string
        payload: Record<string, unknown>
        sourceTransactionId?: string
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.LANDED_COST_ALLOCATED,
            companyId: args.companyId,
            sourceModule: 'VALUATION',
            sourceEntityType: 'LANDED_COST',
            sourceEntityId: args.landedCostId,
            payload: {
                ...args.payload,
                sourceTransactionId: args.sourceTransactionId,
            },
        })
    }

    priceVariancePosted(args: {
        companyId: string
        documentId: string
        payload: Record<string, unknown>
        sourceTransactionId?: string
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.PRICE_VARIANCE_POSTED,
            companyId: args.companyId,
            sourceModule: 'VALUATION',
            sourceEntityType: 'PRICE_VARIANCE',
            sourceEntityId: args.documentId,
            payload: {
                ...args.payload,
                sourceTransactionId: args.sourceTransactionId,
            },
        })
    }

    inventoryRevaluationPosted(args: {
        companyId: string
        documentId: string
        payload: Record<string, unknown>
        sourceTransactionId?: string
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.INVENTORY_REVALUATION_POSTED,
            companyId: args.companyId,
            sourceModule: 'VALUATION',
            sourceEntityType: 'INVENTORY_VALUATION',
            sourceEntityId: args.documentId,
            payload: {
                ...args.payload,
                sourceTransactionId: args.sourceTransactionId,
            },
        })
    }

    inventoryValuationReversed(args: {
        companyId: string
        documentId: string
        payload: Record<string, unknown>
        sourceTransactionId?: string
    }) {
        return this.emitIntegration({
            eventType: MM_DOMAIN_EVENTS.INVENTORY_VALUATION_REVERSED,
            companyId: args.companyId,
            sourceModule: 'VALUATION',
            sourceEntityType: 'INVENTORY_VALUATION',
            sourceEntityId: args.documentId,
            payload: {
                ...args.payload,
                sourceTransactionId: args.sourceTransactionId,
            },
        })
    }

    emitRaw(
        eventType: MmDomainEventType | string,
        event: Omit<MmDomainEventPayload, 'eventType'>,
    ) {
        return this.emit({ ...event, eventType })
    }

    /** Convert integration envelope to legacy payload for existing listeners. */
    toLegacyPayload(envelope: MmIntegrationEventEnvelope): MmDomainEventPayload {
        const legacy = envelopeToLegacyPayload(envelope)
        return {
            eventType: legacy.eventType,
            companyId: legacy.companyId,
            sourceModule: legacy.sourceModule,
            documentType: legacy.documentType,
            documentId: legacy.documentId,
            occurredAt: legacy.occurredAt,
            payload: legacy.payload,
        }
    }
}
