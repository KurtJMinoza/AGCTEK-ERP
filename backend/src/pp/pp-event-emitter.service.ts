import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import type { PpEventType } from './pp-event.types'

@Injectable()
export class PpEventEmitterService {
    constructor(
        private events: EventEmitter2,
        private prisma: PrismaService,
    ) {}

    async emit(eventType: PpEventType, payload: Record<string, unknown>): Promise<void> {
        const eventId = randomUUID()
        const dedupeKey =
            typeof payload.idempotencyKey === 'string' && payload.idempotencyKey
                ? `${eventType}:${payload.idempotencyKey}`
                : `${eventType}:${payload.productionOrderId}:${Date.now()}`

        const envelope = {
            eventId,
            eventType,
            eventVersion: 'v1',
            occurredAt: new Date().toISOString(),
            payload,
        }

        try {
            await this.prisma.ppEventOutbox.create({
                data: {
                    eventId,
                    dedupeKey,
                    eventType,
                    envelope: envelope as unknown as Prisma.InputJsonValue,
                    status: 'PENDING',
                },
            })
        } catch (err: any) {
            if (err?.code !== 'P2002') throw err
        }

        this.events.emit(eventType, envelope)
        this.events.emit('pp.domain.event', envelope)
    }
}
