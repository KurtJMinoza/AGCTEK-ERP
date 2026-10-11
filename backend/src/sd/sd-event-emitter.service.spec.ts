import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../prisma/prisma.service'
import { SdEventEmitterService } from './sd-event-emitter.service'
import { SD_EVENTS } from './sd-event.types'

describe('SdEventEmitterService', () => {
    it('waits for the SD→MM listener before marking an order event dispatched', async () => {
        let consumerFinished = false
        const events = {
            emitAsync: jest.fn(async (eventType: string) => {
                if (eventType === SD_EVENTS.SALES_ORDER_CONFIRMED) {
                    await Promise.resolve()
                    consumerFinished = true
                }
                return []
            }),
        }
        const prisma = {
            sdEventOutbox: {
                create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
        }
        const service = new SdEventEmitterService(
            events as unknown as EventEmitter2,
            prisma as unknown as PrismaService,
        )

        await service.emit(SD_EVENTS.SALES_ORDER_CONFIRMED, {
            salesOrderId: 'so-1',
            idempotencyKey: 'checkout-1',
        })

        expect(consumerFinished).toBe(true)
        expect(events.emitAsync).toHaveBeenNthCalledWith(
            1,
            SD_EVENTS.SALES_ORDER_CONFIRMED,
            expect.objectContaining({
                eventType: SD_EVENTS.SALES_ORDER_CONFIRMED,
                payload: expect.objectContaining({ salesOrderId: 'so-1' }),
            }),
        )
        expect(prisma.sdEventOutbox.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'DISPATCHED' }),
            }),
        )
    })

    it('leaves the outbox pending and surfaces a fulfillment failure for retry', async () => {
        const events = {
            emitAsync: jest.fn().mockRejectedValue(new Error('No source bin')),
        }
        const prisma = {
            sdEventOutbox: {
                create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
                updateMany: jest.fn(),
            },
        }
        const service = new SdEventEmitterService(
            events as unknown as EventEmitter2,
            prisma as unknown as PrismaService,
        )

        await expect(
            service.emit(SD_EVENTS.SALES_ORDER_CONFIRMED, {
                salesOrderId: 'so-1',
            }),
        ).rejects.toThrow('No source bin')
        expect(prisma.sdEventOutbox.updateMany).not.toHaveBeenCalled()
    })
})
