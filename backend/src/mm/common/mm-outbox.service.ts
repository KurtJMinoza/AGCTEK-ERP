import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { MmAccountingContextBuilder } from './mm-accounting-context.builder'
import { MmAccountingEventService } from './mm-accounting-event.service'
import { isFinancialEvent } from './mm-event-catalog.registry'
import { dedupeKeyFromEnvelope } from './mm-event-dedupe.util'
import {
    buildIntegrationEnvelope,
    envelopeToLegacyPayload,
} from './mm-integration-event.builder'
import type {
    MmIntegrationEventEnvelope,
    MmIntegrationEventInput,
    MmOutboxStatus,
} from './mm-integration-event.types'

const DEFAULT_MAX_RETRIES = 5

type TransactionClient = Prisma.TransactionClient

@Injectable()
export class MmOutboxService {
    private readonly logger = new Logger(MmOutboxService.name)

    constructor(
        private prisma: PrismaService,
        private events: EventEmitter2,
        private accountingEvents: MmAccountingEventService,
        private accountingContext: MmAccountingContextBuilder,
    ) {}

    buildEnvelope(input: MmIntegrationEventInput): MmIntegrationEventEnvelope {
        return buildIntegrationEnvelope(input)
    }

    /** Persist outbox row inside an open transaction — atomic with business write. */
    async persistInTransaction(
        tx: TransactionClient,
        envelope: MmIntegrationEventEnvelope,
    ): Promise<void> {
        const dedupeKey = dedupeKeyFromEnvelope(envelope)
        await tx.mmDomainEventOutbox.create({
            data: {
                eventId: envelope.eventId,
                dedupeKey,
                eventType: envelope.eventType,
                eventVersion: envelope.eventVersion,
                companyId: envelope.companyId,
                plantId: envelope.plantId,
                sourceModule: envelope.sourceModule,
                sourceEntityType: envelope.sourceEntityType,
                sourceEntityId: envelope.sourceEntityId,
                correlationId: envelope.correlationId,
                causationId: envelope.causationId,
                actorId: envelope.actorId,
                envelope: envelope as unknown as Prisma.InputJsonValue,
                status: 'PENDING',
            },
        })

        if (isFinancialEvent(envelope.eventType)) {
            await this.accountingEvents.recordFromEnvelope(tx, envelope)
        }
    }

    /** Best-effort outbox persist outside a caller transaction (legacy emit path). */
    async persistStandalone(
        envelope: MmIntegrationEventEnvelope,
    ): Promise<void> {
        const dedupeKey = dedupeKeyFromEnvelope(envelope)
        try {
            await this.prisma.mmDomainEventOutbox.create({
                data: {
                    eventId: envelope.eventId,
                    dedupeKey,
                    eventType: envelope.eventType,
                    eventVersion: envelope.eventVersion,
                    companyId: envelope.companyId,
                    plantId: envelope.plantId,
                    sourceModule: envelope.sourceModule,
                    sourceEntityType: envelope.sourceEntityType,
                    sourceEntityId: envelope.sourceEntityId,
                    correlationId: envelope.correlationId,
                    causationId: envelope.causationId,
                    actorId: envelope.actorId,
                    envelope: envelope as unknown as Prisma.InputJsonValue,
                    status: 'PENDING',
                },
            })
        } catch (err: any) {
            if (err?.code === 'P2002') {
                this.logger.warn(
                    `Duplicate outbox event skipped: ${dedupeKey}`,
                )
                return
            }
            throw err
        }

        if (isFinancialEvent(envelope.eventType)) {
            await this.accountingEvents.recordFromEnvelope(
                this.prisma,
                envelope,
            )
        }
    }

    /** Dispatch in-process after commit — does not mutate outbox when called directly. */
    dispatchInProcess(envelope: MmIntegrationEventEnvelope): void {
        const legacy = envelopeToLegacyPayload(envelope)
        this.events.emit(envelope.eventType, legacy)
        this.events.emit('mm.domain.event', legacy)
        this.events.emit('mm.integration.event', envelope)

        if (isFinancialEvent(envelope.eventType)) {
            void this.emitAccountingRequested(envelope)
        }
    }

    private async emitAccountingRequested(
        envelope: MmIntegrationEventEnvelope,
    ): Promise<void> {
        const idempotencyKey = this.accountingEvents.buildIdempotencyKey(
            envelope.eventType,
            envelope.sourceEntityType,
            envelope.sourceEntityId,
        )
        const existing = await this.prisma.mmAccountingEvent.findUnique({
            where: { idempotencyKey },
        })
        const payload = existing
            ? {
                  ...(existing.payload as object),
                  mmAccountingEventId: existing.id,
                  idempotencyKey: existing.idempotencyKey,
              }
            : await this.accountingContext.buildFromEnvelope(envelope)
        this.events.emit('accounting.entry.requested', {
            ...payload,
            eventType: envelope.eventType,
            correlationId: envelope.correlationId,
            sourceEventId: envelope.eventId,
            mmAccountingEventId: existing?.id,
            idempotencyKey: existing?.idempotencyKey ?? idempotencyKey,
        })
    }

    /** Mark outbox row dispatched after successful in-process fan-out. */
    async markDispatched(outboxId: string): Promise<void> {
        await this.prisma.mmDomainEventOutbox.update({
            where: { id: outboxId },
            data: {
                status: 'DISPATCHED',
                dispatchedAt: new Date(),
                lastError: null,
            },
        })
    }

    async markFailed(
        outboxId: string,
        error: string,
        retryCount: number,
        maxRetries = DEFAULT_MAX_RETRIES,
    ): Promise<MmOutboxStatus> {
        const status: MmOutboxStatus =
            retryCount >= maxRetries ? 'DEAD_LETTER' : 'FAILED'
        await this.prisma.mmDomainEventOutbox.update({
            where: { id: outboxId },
            data: {
                status,
                retryCount,
                lastError: error.slice(0, 2000),
            },
        })
        return status
    }

    /** Process pending outbox rows — retry failed, dead-letter after max retries. */
    async dispatchPending(limit = 50): Promise<number> {
        const rows = await this.prisma.mmDomainEventOutbox.findMany({
            where: { status: { in: ['PENDING', 'FAILED'] } },
            orderBy: { createdAt: 'asc' },
            take: limit,
        })

        let dispatched = 0
        for (const row of rows) {
            const envelope = row.envelope as unknown as MmIntegrationEventEnvelope
            try {
                this.dispatchInProcess(envelope)
                await this.markDispatched(row.id)
                dispatched += 1
            } catch (err: any) {
                const nextRetry = row.retryCount + 1
                const status = await this.markFailed(
                    row.id,
                    err?.message ?? 'dispatch failed',
                    nextRetry,
                )
                this.logger.error(
                    `Outbox dispatch failed (${status}): ${row.dedupeKey}`,
                )
            }
        }
        return dispatched
    }
}
