import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import {
    ficoBuildAccountingIdempotencyKey,
    ficoDerivePostingPurpose,
} from '../../fico/fico-accounting-idempotency.policy'
import { MmAccountingContextBuilder } from './mm-accounting-context.builder'
import {
    type MmAccountingDispatchPayload,
    type MmAccountingStandaloneInput,
} from './mm-accounting-event.types'
import type { MmIntegrationEventEnvelope } from './mm-integration-event.types'

type TransactionClient = Prisma.TransactionClient

export type MmAccountingRecordResult = {
    created: boolean
    duplicate: boolean
    id?: string
    payload?: MmAccountingDispatchPayload
}

@Injectable()
export class MmAccountingEventService {
    private readonly logger = new Logger(MmAccountingEventService.name)

    constructor(
        private contextBuilder: MmAccountingContextBuilder,
        private readonly events: EventEmitter2,
    ) {}

    /** @deprecated Prefer stable Phase 03 keys via {@link buildStableIdempotencyKey}. */
    buildIdempotencyKey(
        eventType: string,
        documentType: string,
        documentId: string,
        suffix?: string,
    ): string {
        const parts = [eventType, documentType, documentId]
        if (suffix) parts.push(suffix)
        return parts.join(':')
    }

    buildStableIdempotencyKey(input: {
        companyId: string
        sourceModule: string
        documentType: string
        documentId: string
        postingPurpose: string
        businessOccurrenceId: string
    }): string {
        return ficoBuildAccountingIdempotencyKey({
            companyId: input.companyId,
            sourceModule: input.sourceModule,
            sourceDocumentType: input.documentType,
            sourceDocumentId: input.documentId,
            postingPurpose: input.postingPurpose,
            businessOccurrenceId: input.businessOccurrenceId,
        })
    }

    async recordFromEnvelope(
        tx: TransactionClient,
        envelope: MmIntegrationEventEnvelope,
    ): Promise<MmAccountingRecordResult> {
        const payload = await this.contextBuilder.buildFromEnvelope(envelope, tx)
        const postingPurpose = ficoDerivePostingPurpose(
            envelope.eventType,
            payload.accountingEffects,
        )
        const businessOccurrenceId =
            (typeof payload.businessOccurrenceId === 'string' &&
                payload.businessOccurrenceId) ||
            (typeof payload.sourceTransactionId === 'string' &&
                payload.sourceTransactionId) ||
            envelope.eventId
        const idempotencyKey =
            payload.idempotencyKey ??
            this.buildStableIdempotencyKey({
                companyId: envelope.companyId,
                sourceModule: envelope.sourceModule,
                documentType: envelope.sourceEntityType,
                documentId: envelope.sourceEntityId,
                postingPurpose,
                businessOccurrenceId,
            })

        return this.persist(tx, {
            eventType: envelope.eventType,
            sourceModule: envelope.sourceModule,
            documentType: envelope.sourceEntityType,
            documentId: envelope.sourceEntityId,
            companyId: envelope.companyId,
            sourceEventId: envelope.eventId,
            sourceTransactionId:
                typeof payload.sourceTransactionId === 'string'
                    ? payload.sourceTransactionId
                    : null,
            idempotencyKey,
            plantId: payload.plantId ?? envelope.plantId ?? null,
            postingDate: new Date(payload.postingDate),
            currencyCode: payload.currencyCode,
            totalValue: new Decimal(payload.totalValue ?? 0),
            accountingEffects: payload.accountingEffects,
            postingPurpose,
            businessOccurrenceId,
            correlationId: payload.correlationId ?? envelope.correlationId ?? null,
            causationId: envelope.causationId ?? null,
            documentDate: new Date(payload.transactionDate ?? payload.postingDate),
            sourceDocumentNumber:
                typeof payload.sourceDocumentNumber === 'string'
                    ? payload.sourceDocumentNumber
                    : null,
            payload,
        })
    }

    async recordStandalone(
        tx: TransactionClient,
        input: MmAccountingStandaloneInput,
    ): Promise<MmAccountingRecordResult> {
        const payload = await this.contextBuilder.buildFromStandalone(input, tx)
        const postingPurpose = ficoDerivePostingPurpose(
            input.eventType,
            input.accountingEffects,
        )
        const businessOccurrenceId =
            input.sourceTransactionId ?? input.sourceEventId ?? input.documentId
        const idempotencyKey =
            input.idempotencyKey ??
            this.buildStableIdempotencyKey({
                companyId: input.companyId,
                sourceModule: input.sourceModule,
                documentType: input.documentType,
                documentId: input.documentId,
                postingPurpose,
                businessOccurrenceId,
            })

        return this.persist(tx, {
            eventType: input.eventType,
            sourceModule: input.sourceModule,
            documentType: input.documentType,
            documentId: input.documentId,
            companyId: input.companyId,
            sourceEventId: input.sourceEventId ?? null,
            sourceTransactionId: input.sourceTransactionId ?? null,
            idempotencyKey,
            plantId: payload.plantId ?? input.plantId ?? null,
            postingDate: new Date(payload.postingDate),
            currencyCode: payload.currencyCode,
            totalValue: new Decimal(payload.totalValue ?? 0),
            accountingEffects: payload.accountingEffects,
            postingPurpose,
            businessOccurrenceId,
            correlationId:
                typeof payload.correlationId === 'string'
                    ? payload.correlationId
                    : null,
            causationId:
                typeof payload.causationId === 'string' ? payload.causationId : null,
            documentDate: new Date(payload.transactionDate ?? payload.postingDate),
            sourceDocumentNumber:
                typeof payload.sourceDocumentNumber === 'string'
                    ? payload.sourceDocumentNumber
                    : null,
            payload,
        })
    }

    toDispatchPayload(
        record: MmAccountingRecordResult,
    ): MmAccountingDispatchPayload | null {
        if (!record.payload) return null
        return {
            ...record.payload,
            idempotencyKey: record.payload.idempotencyKey,
            mmAccountingEventId: record.id,
        }
    }

    private async persist(
        tx: TransactionClient,
        data: {
            eventType: string
            sourceModule: string
            documentType: string
            documentId: string
            companyId: string
            sourceEventId: string | null
            sourceTransactionId: string | null
            idempotencyKey: string
            plantId: string | null
            postingDate: Date
            currencyCode: string
            totalValue: Decimal
            accountingEffects: string[]
            payload: Record<string, unknown>
            postingPurpose?: string
            businessOccurrenceId?: string
            correlationId?: string | null
            causationId?: string | null
            documentDate?: Date
            sourceDocumentNumber?: string | null
        },
    ): Promise<MmAccountingRecordResult> {
        const enrichedPayload = {
            ...data.payload,
            idempotencyKey: data.idempotencyKey,
            sourceEventId: data.sourceEventId,
            sourceTransactionId: data.sourceTransactionId,
        }

        try {
            const valuationSnapshot = {
                lines: (data.payload as { lines?: unknown }).lines ?? null,
                totalValue: data.totalValue.toString(),
                currencyCode: data.currencyCode,
            }
            const row = await tx.mmAccountingEvent.create({
                data: {
                    eventType: data.eventType,
                    sourceModule: data.sourceModule,
                    documentType: data.documentType,
                    documentId: data.documentId,
                    companyId: data.companyId,
                    sourceEventId: data.sourceEventId,
                    sourceTransactionId: data.sourceTransactionId,
                    idempotencyKey: data.idempotencyKey,
                    plantId: data.plantId,
                    postingPurpose: data.postingPurpose,
                    businessOccurrenceId: data.businessOccurrenceId,
                    documentDate: data.documentDate ?? data.postingDate,
                    postingDate: data.postingDate,
                    currencyCode: data.currencyCode,
                    totalValue: data.totalValue,
                    accountingEffects: data.accountingEffects,
                    valuationSnapshot,
                    accountingDimensions: {
                        plantId: data.plantId,
                        companyId: data.companyId,
                    },
                    payloadSchemaVersion: 'v2',
                    correlationId: data.correlationId,
                    causationId: data.causationId,
                    sourceDocumentNumber: data.sourceDocumentNumber,
                    payload: enrichedPayload as Prisma.InputJsonValue,
                    status: 'PENDING',
                    retryEligible: true,
                },
            })

            const financiallyRelevant =
                (data.payload as { financiallyRelevant?: boolean }).financiallyRelevant !==
                    false && data.accountingEffects.length > 0
            if (financiallyRelevant) {
                this.events.emit('accounting.event.status.changed', {
                    documentType: data.documentType,
                    documentId: data.documentId,
                    companyId: data.companyId,
                    eventStatus: 'PENDING',
                })
            }

            return {
                created: true,
                duplicate: false,
                id: row.id,
                payload: {
                    ...(enrichedPayload as any),
                    mmAccountingEventId: row.id,
                },
            }
        } catch (err: any) {
            if (err?.code === 'P2002') {
                this.logger.warn(
                    `Duplicate accounting event skipped: ${data.idempotencyKey}`,
                )
                const existing = await tx.mmAccountingEvent.findUnique({
                    where: { idempotencyKey: data.idempotencyKey },
                })
                return {
                    created: false,
                    duplicate: true,
                    id: existing?.id,
                    payload: existing
                        ? ({
                              ...(existing.payload as object),
                              mmAccountingEventId: existing.id,
                          } as MmAccountingDispatchPayload)
                        : undefined,
                }
            }
            throw err
        }
    }
}
