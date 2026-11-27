import { EventEmitter2 } from '@nestjs/event-emitter'
import { MmAccountingContextBuilder } from './mm-accounting-context.builder'
import { MmAccountingEventService } from './mm-accounting-event.service'
import { MmOutboxService } from './mm-outbox.service'

describe('MmOutboxService.emitAccountingRequested', () => {
    it('dispatches durable event with stable idempotency key (no legacy duplicate)', async () => {
        const stableKey =
            'co-1:STOCK_OPS:GOODS_ISSUE:gi-1:COGS_EXPENSE|INVENTORY_DECREASE:tx-1'
        const prisma = {
            mmAccountingEvent: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'evt-stable',
                    status: 'PENDING',
                    idempotencyKey: stableKey,
                    payload: {
                        companyId: 'co-1',
                        documentId: 'gi-1',
                        financiallyRelevant: true,
                    },
                }),
                findUnique: jest.fn(),
            },
        }
        const events = { emit: jest.fn() }
        const accountingEvents = {
            buildIdempotencyKey: jest
                .fn()
                .mockReturnValue('GoodsIssuePosted:GOODS_ISSUE:gi-1'),
        }
        const accountingContext = { buildFromEnvelope: jest.fn() }
        const service = new MmOutboxService(
            prisma as never,
            events as never,
            accountingEvents as unknown as MmAccountingEventService,
            accountingContext as unknown as MmAccountingContextBuilder,
        )

        await (
            service as unknown as {
                emitAccountingRequested: (e: unknown) => Promise<void>
            }
        ).emitAccountingRequested({
            eventType: 'GoodsIssuePosted',
            sourceEntityType: 'GOODS_ISSUE',
            sourceEntityId: 'gi-1',
            companyId: 'co-1',
            eventId: 'env-1',
            correlationId: 'corr-1',
        })

        expect(prisma.mmAccountingEvent.findFirst).toHaveBeenCalled()
        expect(events.emit).toHaveBeenCalledWith(
            'accounting.entry.requested',
            expect.objectContaining({
                idempotencyKey: stableKey,
                mmAccountingEventId: 'evt-stable',
            }),
        )
        expect(accountingContext.buildFromEnvelope).not.toHaveBeenCalled()
    })
})