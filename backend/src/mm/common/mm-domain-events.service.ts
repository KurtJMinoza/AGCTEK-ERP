import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    MM_DOMAIN_EVENTS,
    type MmDomainEventPayload,
    type MmDomainEventType,
} from './mm-domain-events.types'

const FINANCIAL_EVENTS = new Set<string>([
    MM_DOMAIN_EVENTS.GOODS_RECEIPT_POSTED,
    MM_DOMAIN_EVENTS.GOODS_ISSUE_POSTED,
    MM_DOMAIN_EVENTS.INVENTORY_ADJUSTED,
    MM_DOMAIN_EVENTS.INVENTORY_TRANSFERRED,
    MM_DOMAIN_EVENTS.SUPPLIER_RETURN_POSTED,
])

@Injectable()
export class MmDomainEventsService {
    constructor(
        private events: EventEmitter2,
        private prisma: PrismaService,
    ) {}

    async emit(event: MmDomainEventPayload): Promise<void> {
        this.events.emit(event.eventType, event)
        this.events.emit('mm.domain.event', event)

        if (FINANCIAL_EVENTS.has(event.eventType)) {
            await this.prisma.mmAccountingEvent.create({
                data: {
                    eventType: event.eventType,
                    sourceModule: event.sourceModule,
                    documentType: event.documentType,
                    documentId: event.documentId,
                    companyId: event.companyId,
                    payload: event as unknown as Prisma.InputJsonValue,
                    status: 'PENDING',
                },
            })
            this.events.emit('accounting.entry.requested', event.payload)
        }
    }

    goodsReceiptPosted(args: {
        companyId: string
        goodsReceiptId: string
        payload: Record<string, unknown>
    }) {
        return this.emit({
            eventType: MM_DOMAIN_EVENTS.GOODS_RECEIPT_POSTED,
            companyId: args.companyId,
            sourceModule: 'STOCK_OPS',
            documentType: 'GOODS_RECEIPT',
            documentId: args.goodsReceiptId,
            occurredAt: new Date().toISOString(),
            payload: args.payload,
        })
    }

    goodsIssuePosted(args: {
        companyId: string
        goodsIssueId: string
        payload: Record<string, unknown>
    }) {
        return this.emit({
            eventType: MM_DOMAIN_EVENTS.GOODS_ISSUE_POSTED,
            companyId: args.companyId,
            sourceModule: 'STOCK_OPS',
            documentType: 'GOODS_ISSUE',
            documentId: args.goodsIssueId,
            occurredAt: new Date().toISOString(),
            payload: args.payload,
        })
    }

    inventoryAdjusted(args: {
        companyId: string
        documentId: string
        payload: Record<string, unknown>
    }) {
        return this.emit({
            eventType: MM_DOMAIN_EVENTS.INVENTORY_ADJUSTED,
            companyId: args.companyId,
            sourceModule: String(args.payload.sourceModule ?? 'STOCK_OPS'),
            documentType: String(args.payload.documentType ?? 'ADJUSTMENT'),
            documentId: args.documentId,
            occurredAt: new Date().toISOString(),
            payload: args.payload,
        })
    }

    inventoryTransactionPosted(args: {
        companyId: string
        transactionId: string
        payload: Record<string, unknown>
    }) {
        return this.emit({
            eventType: MM_DOMAIN_EVENTS.INVENTORY_TRANSACTION_POSTED,
            companyId: args.companyId,
            sourceModule: 'INVENTORY',
            documentType: 'INVENTORY_TRANSACTION',
            documentId: args.transactionId,
            occurredAt: new Date().toISOString(),
            payload: args.payload,
        })
    }

    inventoryTransactionReversed(args: {
        companyId: string
        reversalId: string
        payload: Record<string, unknown>
    }) {
        return this.emit({
            eventType: MM_DOMAIN_EVENTS.INVENTORY_TRANSACTION_REVERSED,
            companyId: args.companyId,
            sourceModule: 'INVENTORY',
            documentType: 'INVENTORY_TRANSACTION',
            documentId: args.reversalId,
            occurredAt: new Date().toISOString(),
            payload: args.payload,
        })
    }

    qualityDecisionMade(args: {
        companyId: string
        inspectionId: string
        payload: Record<string, unknown>
    }) {
        return this.emit({
            eventType: MM_DOMAIN_EVENTS.QUALITY_DECISION_MADE,
            companyId: args.companyId,
            sourceModule: 'INBOUND',
            documentType: 'QUALITY_INSPECTION',
            documentId: args.inspectionId,
            occurredAt: new Date().toISOString(),
            payload: args.payload,
        })
    }

    reservationCreated(args: {
        companyId: string
        reservationId: string
        payload: Record<string, unknown>
    }) {
        return this.emit({
            eventType: MM_DOMAIN_EVENTS.RESERVATION_CREATED,
            companyId: args.companyId,
            sourceModule: 'INVENTORY',
            documentType: 'RESERVATION',
            documentId: args.reservationId,
            occurredAt: new Date().toISOString(),
            payload: args.payload,
        })
    }

    reservationReleased(args: {
        companyId: string
        reservationId: string
        payload: Record<string, unknown>
    }) {
        return this.emit({
            eventType: MM_DOMAIN_EVENTS.RESERVATION_RELEASED,
            companyId: args.companyId,
            sourceModule: 'INVENTORY',
            documentType: 'RESERVATION',
            documentId: args.reservationId,
            occurredAt: new Date().toISOString(),
            payload: args.payload,
        })
    }

    supplierReturnPosted(args: {
        companyId: string
        returnId: string
        payload: Record<string, unknown>
    }) {
        return this.emit({
            eventType: MM_DOMAIN_EVENTS.SUPPLIER_RETURN_POSTED,
            companyId: args.companyId,
            sourceModule: 'RETURNS_DISPOSAL',
            documentType: 'SUPPLIER_RETURN',
            documentId: args.returnId,
            occurredAt: new Date().toISOString(),
            payload: args.payload,
        })
    }

    inventoryTransferred(args: {
        companyId: string
        documentId: string
        payload: Record<string, unknown>
    }) {
        return this.emit({
            eventType: MM_DOMAIN_EVENTS.INVENTORY_TRANSFERRED,
            companyId: args.companyId,
            sourceModule: String(args.payload.sourceModule ?? 'WAREHOUSE'),
            documentType: String(args.payload.documentType ?? 'WM_TRANSFER'),
            documentId: args.documentId,
            occurredAt: new Date().toISOString(),
            payload: args.payload,
        })
    }

    emitRaw(eventType: MmDomainEventType | string, event: Omit<MmDomainEventPayload, 'eventType'>) {
        return this.emit({ ...event, eventType })
    }
}
