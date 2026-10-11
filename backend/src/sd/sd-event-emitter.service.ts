import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import type { SdEventType } from './sd-event.types'

@Injectable()
export class SdEventEmitterService {
    constructor(
        private events: EventEmitter2,
        private prisma: PrismaService,
    ) {}

    async emit(eventType: SdEventType, payload: Record<string, unknown>): Promise<void> {
        const eventId = randomUUID()
        const dedupeKey =
            typeof payload.idempotencyKey === 'string' && payload.idempotencyKey
                ? `${eventType}:${payload.idempotencyKey}`
                : `${eventType}:${payload.salesOrderId}:${Date.now()}`

        const envelope = {
            eventId,
            eventType,
            eventVersion: 'v1',
            occurredAt: new Date().toISOString(),
            payload,
        }

        try {
            await this.prisma.sdEventOutbox.create({
                data: {
                    eventId,
                    dedupeKey,
                    eventType,
                    envelope: envelope as unknown as Prisma.InputJsonValue,
                    status: 'PENDING',
                },
            })
        } catch (err: unknown) {
            const code =
                typeof err === 'object' && err !== null && 'code' in err
                    ? (err as { code?: string }).code
                    : undefined
            if (code !== 'P2002') throw err
        }

        // `emit()` returns immediately even when a listener is async.  The
        // SD → MM listener reserves, allocates, and creates picking tasks, so
        // returning the checkout response before it finishes made a placed
        // shop order appear in SD while warehouse work was still pending (or
        // failed without reaching the caller).  Keep the existing outbox and
        // event contract, but await its in-process consumers at the release
        // boundary.  The MM consumer's persisted receipt remains the retry /
        // duplicate-delivery guard.
        await this.events.emitAsync(eventType, envelope)
        await this.events.emitAsync('sd.domain.event', envelope)

        // The event was delivered to the in-process consumers successfully.
        // A duplicate delivery has no row with this freshly generated eventId;
        // updateMany intentionally makes that case a harmless no-op.
        await this.prisma.sdEventOutbox.updateMany({
            where: { eventId, status: 'PENDING' },
            data: { status: 'DISPATCHED', dispatchedAt: new Date() },
        })
    }
}
