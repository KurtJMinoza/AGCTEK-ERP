import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    buildEventDedupeKey,
    consumerReceiptKey,
    dedupeKeyFromEnvelope,
} from './mm-event-dedupe.util'
import type { MmIntegrationEventEnvelope } from './mm-integration-event.types'

export type MmConsumerHandleResult = {
    processed: boolean
    duplicate: boolean
    receiptId?: string
}

/**
 * Idempotent consumer helper — records `(consumerId, dedupeKey)` receipts
 * so duplicate deliveries do not duplicate downstream business state.
 */
@Injectable()
export class MmEventConsumerService {
    private readonly logger = new Logger(MmEventConsumerService.name)

    constructor(private prisma: PrismaService) {}

    buildDedupeKey(envelope: MmIntegrationEventEnvelope): string {
        return dedupeKeyFromEnvelope(envelope)
    }

    async hasProcessed(
        consumerId: string,
        dedupeKey: string,
    ): Promise<boolean> {
        const receipt = await this.prisma.mmEventConsumerReceipt.findUnique({
            where: {
                consumerId_dedupeKey: {
                    consumerId,
                    dedupeKey,
                },
            },
        })
        return receipt?.status === 'PROCESSED'
    }

    async recordProcessed(args: {
        consumerId: string
        envelope: MmIntegrationEventEnvelope
        metadata?: Record<string, unknown>
    }): Promise<MmConsumerHandleResult> {
        const dedupeKey = dedupeKeyFromEnvelope(args.envelope)
        const key = consumerReceiptKey(args.consumerId, dedupeKey)

        const existing = await this.prisma.mmEventConsumerReceipt.findUnique({
            where: {
                consumerId_dedupeKey: {
                    consumerId: args.consumerId,
                    dedupeKey,
                },
            },
        })
        if (existing?.status === 'PROCESSED') {
            this.logger.debug(`Duplicate delivery skipped: ${key}`)
            return { processed: false, duplicate: true, receiptId: existing.id }
        }

        const receipt = await this.prisma.mmEventConsumerReceipt.upsert({
            where: {
                consumerId_dedupeKey: {
                    consumerId: args.consumerId,
                    dedupeKey,
                },
            },
            create: {
                consumerId: args.consumerId,
                dedupeKey,
                eventId: args.envelope.eventId,
                eventType: args.envelope.eventType,
                status: 'PROCESSED',
                processedAt: new Date(),
                metadata: (args.metadata ?? undefined) as
                    | Prisma.InputJsonValue
                    | undefined,
            },
            update: {
                status: 'PROCESSED',
                processedAt: new Date(),
                retryCount: { increment: 0 },
                lastError: null,
                metadata: (args.metadata ?? undefined) as
                    | Prisma.InputJsonValue
                    | undefined,
            },
        })

        return { processed: true, duplicate: false, receiptId: receipt.id }
    }

    async recordFailed(args: {
        consumerId: string
        envelope: MmIntegrationEventEnvelope
        error: string
    }): Promise<void> {
        const dedupeKey = dedupeKeyFromEnvelope(args.envelope)
        await this.prisma.mmEventConsumerReceipt.upsert({
            where: {
                consumerId_dedupeKey: {
                    consumerId: args.consumerId,
                    dedupeKey,
                },
            },
            create: {
                consumerId: args.consumerId,
                dedupeKey,
                eventId: args.envelope.eventId,
                eventType: args.envelope.eventType,
                status: 'FAILED',
                lastError: args.error.slice(0, 2000),
                retryCount: 1,
            },
            update: {
                status: 'FAILED',
                lastError: args.error.slice(0, 2000),
                retryCount: { increment: 1 },
            },
        })
    }

    /** Run handler once — skips if already processed; records outcome. */
    async handleIdempotent<T>(args: {
        consumerId: string
        envelope: MmIntegrationEventEnvelope
        handler: () => Promise<T>
    }): Promise<{ result?: T; duplicate: boolean }> {
        const dedupeKey = dedupeKeyFromEnvelope(args.envelope)
        if (await this.hasProcessed(args.consumerId, dedupeKey)) {
            return { duplicate: true }
        }

        try {
            const result = await args.handler()
            await this.recordProcessed({
                consumerId: args.consumerId,
                envelope: args.envelope,
            })
            return { result, duplicate: false }
        } catch (err: any) {
            await this.recordFailed({
                consumerId: args.consumerId,
                envelope: args.envelope,
                error: err?.message ?? 'consumer failed',
            })
            throw err
        }
    }

    /** Legacy dedupe key for events without full envelope. */
    legacyDedupeKey(
        eventType: string,
        documentType: string,
        documentId: string,
    ): string {
        return buildEventDedupeKey(eventType, documentType, documentId)
    }
}
