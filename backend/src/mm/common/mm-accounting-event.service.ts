import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
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

    constructor(private contextBuilder: MmAccountingContextBuilder) {}

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

    async recordFromEnvelope(
        tx: TransactionClient,
        envelope: MmIntegrationEventEnvelope,
    ): Promise<MmAccountingRecordResult> {
        const payload = await this.contextBuilder.buildFromEnvelope(envelope, tx)
        const idempotencyKey =
            payload.idempotencyKey ??
            this.buildIdempotencyKey(
                envelope.eventType,
                envelope.sourceEntityType,
                envelope.sourceEntityId,
            )

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
            payload,
        })
    }

    async recordStandalone(
        tx: TransactionClient,
        input: MmAccountingStandaloneInput,
    ): Promise<MmAccountingRecordResult> {
        const payload = await this.contextBuilder.buildFromStandalone(input, tx)
        const idempotencyKey =
            input.idempotencyKey ??
            this.buildIdempotencyKey(
                input.eventType,
                input.documentType,
                input.documentId,
            )

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
        },
    ): Promise<MmAccountingRecordResult> {
        const enrichedPayload = {
            ...data.payload,
            idempotencyKey: data.idempotencyKey,
            sourceEventId: data.sourceEventId,
            sourceTransactionId: data.sourceTransactionId,
        }

        try {
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
                    postingDate: data.postingDate,
                    currencyCode: data.currencyCode,
                    totalValue: data.totalValue,
                    accountingEffects: data.accountingEffects,
                    payload: enrichedPayload as Prisma.InputJsonValue,
                    status: 'PENDING',
                },
            })

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
