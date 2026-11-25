import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'

type RecordAndDispatchInput = {
    eventType: string
    documentType: string
    documentId: string
    companyId: string
    postingDate: Date
    currencyCode: string
    idempotencyKey: string
    payload: Record<string, unknown>
    totalValue?: Decimal
}

/**
 * Records durable SD accounting events (`mm_accounting_events`) and dispatches
 * them through the same consumer pipeline as MM.
 *
 * COGS for valuated sales remains owned by MM goods issue — this bridge never
 * posts inventory or COGS for POS revenue.
 */
@Injectable()
export class FicoSdAccountingBridgeService {
    private readonly logger = new Logger(FicoSdAccountingBridgeService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly events: EventEmitter2,
    ) {}

    async recordAndDispatch(input: RecordAndDispatchInput): Promise<void> {
        let cashierUserId: string | null = null
        let orderNumber: string | null = null
        if (input.documentType === 'SALES_ORDER' && input.documentId) {
            const order = await this.prisma.sdSalesOrder.findUnique({
                where: { id: input.documentId },
                select: { cashierUserId: true, orderNumber: true },
            })
            cashierUserId = order?.cashierUserId ?? null
            orderNumber = order?.orderNumber ?? null
        }
        const enriched: MmAccountingDispatchPayload = {
            schemaVersion: 'v2',
            eventType: input.eventType,
            companyId: input.companyId,
            postingDate: input.postingDate.toISOString(),
            transactionDate: input.postingDate.toISOString(),
            currencyCode: input.currencyCode,
            documentType: input.documentType,
            documentId: input.documentId,
            sourceModule: 'SD',
            accountingEffects: [],
            lines: [],
            financiallyRelevant: true,
            idempotencyKey: input.idempotencyKey,
            financialFingerprint: this.fingerprint(input),
            ...input.payload,
            salesOrderId:
                (input.payload.salesOrderId as string | undefined) ??
                (input.documentType === 'SALES_ORDER' ? input.documentId : undefined),
            orderNumber:
                (input.payload.orderNumber as string | undefined) ?? orderNumber ?? undefined,
            cashierUserId:
                (input.payload.cashierUserId as string | undefined) ?? cashierUserId ?? undefined,
        }

        let eventId: string | undefined
        try {
            const row = await this.prisma.mmAccountingEvent.create({
                data: {
                    eventType: input.eventType,
                    sourceModule: 'SD',
                    documentType: input.documentType,
                    documentId: input.documentId,
                    companyId: input.companyId,
                    idempotencyKey: input.idempotencyKey,
                    postingDate: input.postingDate,
                    currencyCode: input.currencyCode,
                    totalValue: input.totalValue ?? new Decimal(0),
                    accountingEffects: [],
                    payload: enriched as Prisma.InputJsonValue,
                    status: 'PENDING',
                },
            })
            eventId = row.id
        } catch (err: unknown) {
            if ((err as { code?: string })?.code === 'P2002') {
                const existing = await this.prisma.mmAccountingEvent.findUnique({
                    where: { idempotencyKey: input.idempotencyKey },
                })
                if (!existing) return
                if (existing.status === 'CONSUMED' || existing.status === 'SKIPPED') {
                    return
                }
                eventId = existing.id
                enriched.financialFingerprint = (existing.payload as {
                    financialFingerprint?: string
                })?.financialFingerprint
            } else {
                throw err
            }
        }

        this.events.emit('accounting.entry.requested', {
            ...enriched,
            mmAccountingEventId: eventId,
            idempotencyKey: input.idempotencyKey,
        })
    }

    async reversePosRevenueJournal(
        companyId: string,
        salesOrderId: string,
        reason: string,
        voidIdempotencyKey: string,
    ): Promise<void> {
        const revenueKey = `pos-revenue:${salesOrderId}`
        const original = await this.prisma.ficoJournalEntry.findUnique({
            where: { idempotencyKey: revenueKey },
            select: { id: true, status: true },
        })
        if (!original || original.status !== 'POSTED') {
            this.logger.debug(
                `No posted POS revenue journal to reverse for order ${salesOrderId}`,
            )
            return
        }
        const existingVoid = await this.prisma.ficoJournalEntry.findUnique({
            where: { idempotencyKey: voidIdempotencyKey },
        })
        if (existingVoid) return

        await this.recordAndDispatch({
            eventType: 'PosSaleVoided',
            documentType: 'POS_VOID',
            documentId: salesOrderId,
            companyId,
            postingDate: new Date(),
            currencyCode: 'PHP',
            idempotencyKey: voidIdempotencyKey,
            payload: {
                reversalOfJournalId: original.id,
                reversalReason: reason,
                salesOrderId,
            },
        })
    }

    private fingerprint(input: RecordAndDispatchInput): string {
        return [
            input.eventType,
            input.documentId,
            input.totalValue?.toString() ?? '0',
            JSON.stringify(input.payload),
        ].join('|')
    }
}