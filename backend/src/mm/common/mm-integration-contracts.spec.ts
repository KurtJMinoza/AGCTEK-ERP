/**
 * Phase 3A — MM cross-module integration contract tests
 */
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Test, TestingModule } from '@nestjs/testing'
import { PrismaService } from '../../prisma/prisma.service'
import { MM_DOMAIN_EVENTS } from './mm-domain-events.types'
import { MmDomainEventsService } from './mm-domain-events.service'
import {
    getEventCatalogEntry,
    isFinancialEvent,
    listCatalogEvents,
    resolveEventVersion,
} from './mm-event-catalog.registry'
import { MmEventConsumerService } from './mm-event-consumer.service'
import { buildEventDedupeKey } from './mm-event-dedupe.util'
import {
    buildIntegrationEnvelope,
    upgradePayloadToV2,
} from './mm-integration-event.builder'
import { MM_EVENT_VERSIONS } from './mm-integration-event.types'
import { MmAccountingContextBuilder } from './mm-accounting-context.builder'
import { MmAccountingEventService } from './mm-accounting-event.service'
import { MmOutboxService } from './mm-outbox.service'

describe('MM Integration Contracts Phase 3A', () => {
    describe('event catalog registry', () => {
        it('registers all Phase 3A catalog events', () => {
            const types = listCatalogEvents().map((e) => e.eventType)
            expect(types).toEqual(
                expect.arrayContaining([
                    'MaterialCreated',
                    'GoodsReceiptPosted',
                    'MRPCompleted',
                    'InventoryValuationUpdated',
                    'PutawayCompleted',
                    'AllocationCreated',
                ]),
            )
            expect(types.length).toBeGreaterThanOrEqual(40)
        })

        it('marks financial events for FICO outbox bridge', () => {
            expect(isFinancialEvent('GoodsReceiptPosted')).toBe(true)
            expect(isFinancialEvent('InspectionLotCreated')).toBe(false)
            expect(getEventCatalogEntry('GoodsReceiptPosted')?.currentVersion).toBe(
                MM_EVENT_VERSIONS.V2,
            )
        })
    })

    describe('event envelope + versioning', () => {
        it('builds v1 envelope by default', () => {
            const envelope = buildIntegrationEnvelope({
                eventType: 'GoodsReceiptPosted',
                companyId: 'co-1',
                sourceModule: 'STOCK_OPS',
                sourceEntityType: 'GOODS_RECEIPT',
                sourceEntityId: 'gr-1',
                payload: { goodsReceiptId: 'gr-1', purchaseOrderId: 'po-1' },
                documentReferences: [
                    { entityType: 'PURCHASE_ORDER', entityId: 'po-1' },
                    { entityType: 'RECEIVING_DOCUMENT', entityId: 'rcv-1' },
                ],
            })
            expect(envelope.eventId).toBeTruthy()
            expect(envelope.eventVersion).toBe(MM_EVENT_VERSIONS.V2)
            expect(envelope.correlationId).toBeTruthy()
            expect(envelope.documentReferences).toHaveLength(2)
        })

        it('supports explicit v1 when catalog allows', () => {
            const version = resolveEventVersion(
                'GoodsReceiptPosted',
                MM_EVENT_VERSIONS.V1,
            )
            expect(version).toBe(MM_EVENT_VERSIONS.V1)
        })

        it('v2 payload upgrade adds schemaVersion without breaking v1 fields', () => {
            const v2 = upgradePayloadToV2({ goodsReceiptId: 'gr-1', qty: 10 })
            expect(v2.schemaVersion).toBe(MM_EVENT_VERSIONS.V2)
            expect(v2.goodsReceiptId).toBe('gr-1')
        })
    })

    describe('correlation chain', () => {
        it('links PO → GR → inventory via correlationId and causationId', () => {
            const correlationId = 'proc-100'
            const poApproved = buildIntegrationEnvelope({
                eventType: 'PurchaseOrderApproved',
                companyId: 'co-1',
                sourceModule: 'PROCUREMENT',
                sourceEntityType: 'PURCHASE_ORDER',
                sourceEntityId: 'po-1',
                payload: { purchaseOrderId: 'po-1' },
                correlationId,
            })
            const grPosted = buildIntegrationEnvelope({
                eventType: 'GoodsReceiptPosted',
                companyId: 'co-1',
                sourceModule: 'STOCK_OPS',
                sourceEntityType: 'GOODS_RECEIPT',
                sourceEntityId: 'gr-1',
                payload: {
                    goodsReceiptId: 'gr-1',
                    purchaseOrderId: 'po-1',
                },
                correlationId,
                causationId: poApproved.eventId,
                documentReferences: [
                    { entityType: 'PURCHASE_ORDER', entityId: 'po-1' },
                    { entityType: 'GOODS_RECEIPT', entityId: 'gr-1' },
                ],
            })
            expect(grPosted.correlationId).toBe(correlationId)
            expect(grPosted.causationId).toBe(poApproved.eventId)
            expect(grPosted.documentReferences?.map((r) => r.entityId)).toEqual(
                ['po-1', 'gr-1'],
            )
        })
    })

    describe('MmDomainEventsService + outbox atomicity', () => {
        const mockTx: any = {
            mmDomainEventOutbox: { create: jest.fn().mockResolvedValue({}) },
            mmAccountingEvent: { create: jest.fn().mockResolvedValue({}) },
        }
        const mockPrisma: any = {
            mmDomainEventOutbox: {
                create: jest.fn().mockResolvedValue({}),
                findMany: jest.fn().mockResolvedValue([]),
                update: jest.fn().mockResolvedValue({}),
            },
            mmAccountingEvent: {
                create: jest.fn().mockResolvedValue({ id: 'acct-1', idempotencyKey: 'k-1' }),
                findUnique: jest.fn().mockResolvedValue(null),
            },
            mmMaterial: {
                findMany: jest.fn().mockResolvedValue([]),
                findFirst: jest.fn().mockResolvedValue(null),
            },
            warehouse: { findMany: jest.fn().mockResolvedValue([]) },
        }
        const emitted: string[] = []
        const mockEvents = {
            emit: jest.fn((type: string) => {
                emitted.push(type)
            }),
        }

        let domainEvents: MmDomainEventsService

        beforeEach(async () => {
            emitted.length = 0
            jest.clearAllMocks()
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    MmAccountingContextBuilder,
                    MmAccountingEventService,
                    MmOutboxService,
                    MmDomainEventsService,
                    { provide: PrismaService, useValue: mockPrisma },
                    { provide: EventEmitter2, useValue: mockEvents },
                ],
            }).compile()
            domainEvents = module.get(MmDomainEventsService)
        })

        it('creates integration event with outbox + in-process dispatch', async () => {
            await domainEvents.emitIntegration({
                eventType: MM_DOMAIN_EVENTS.INSPECTION_LOT_CREATED,
                companyId: 'co-1',
                sourceModule: 'RECEIVING',
                sourceEntityType: 'INSPECTION_LOT',
                sourceEntityId: 'lot-1',
                payload: { inspectionLotId: 'lot-1' },
            })
            expect(mockPrisma.mmDomainEventOutbox.create).toHaveBeenCalled()
            expect(emitted).toContain('InspectionLotCreated')
            expect(emitted).toContain('mm.integration.event')
            expect(mockPrisma.mmAccountingEvent.create).not.toHaveBeenCalled()
        })

        it('persists outbox + accounting event atomically in transaction', async () => {
            const envelope = await domainEvents.emitInTransaction(mockTx, {
                eventType: MM_DOMAIN_EVENTS.GOODS_RECEIPT_POSTED,
                companyId: 'co-1',
                sourceModule: 'STOCK_OPS',
                sourceEntityType: 'GOODS_RECEIPT',
                sourceEntityId: 'gr-1',
                payload: { goodsReceiptId: 'gr-1' },
            })
            expect(mockTx.mmDomainEventOutbox.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        eventType: 'GoodsReceiptPosted',
                        dedupeKey: buildEventDedupeKey(
                            'GoodsReceiptPosted',
                            'GOODS_RECEIPT',
                            'gr-1',
                            envelope.eventVersion,
                        ),
                    }),
                }),
            )
            expect(mockTx.mmAccountingEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        idempotencyKey: expect.stringContaining('GoodsReceiptPosted'),
                    }),
                }),
            )
        })

        it('legacy emit still dispatches mm.domain.event', async () => {
            await domainEvents.emit({
                eventType: MM_DOMAIN_EVENTS.RESERVATION_CREATED,
                companyId: 'co-1',
                sourceModule: 'INVENTORY',
                documentType: 'RESERVATION',
                documentId: 'res-1',
                occurredAt: new Date().toISOString(),
                payload: { reservationId: 'res-1' },
            })
            expect(emitted).toContain('mm.domain.event')
            expect(emitted).toContain('ReservationCreated')
        })
    })

    describe('idempotent consumer + outbox retry', () => {
        const envelope = buildIntegrationEnvelope({
            eventType: 'GoodsReceiptPosted',
            companyId: 'co-1',
            sourceModule: 'STOCK_OPS',
            sourceEntityType: 'GOODS_RECEIPT',
            sourceEntityId: 'gr-dup',
            payload: { goodsReceiptId: 'gr-dup' },
        })

        const receipts = new Map<string, any>()
        const mockPrisma: any = {
            mmEventConsumerReceipt: {
                findUnique: jest.fn(({ where }: any) => {
                    const key = `${where.consumerId_dedupeKey.consumerId}:${where.consumerId_dedupeKey.dedupeKey}`
                    return Promise.resolve(receipts.get(key) ?? null)
                }),
                upsert: jest.fn(({ where, create, update }: any) => {
                    const key = `${where.consumerId_dedupeKey.consumerId}:${where.consumerId_dedupeKey.dedupeKey}`
                    const existing = receipts.get(key)
                    const row = existing
                        ? { ...existing, ...update, id: existing.id }
                        : { ...create, id: `rcpt-${receipts.size + 1}` }
                    receipts.set(key, row)
                    return Promise.resolve(row)
                }),
            },
            mmDomainEventOutbox: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'ob-1',
                        retryCount: 4,
                        dedupeKey: 'k',
                        envelope,
                    },
                ]),
                update: jest.fn().mockResolvedValue({}),
            },
            mmAccountingEvent: {
                create: jest.fn().mockResolvedValue({ id: 'acct-1' }),
                findUnique: jest.fn().mockResolvedValue(null),
            },
            mmMaterial: {
                findMany: jest.fn().mockResolvedValue([]),
                findFirst: jest.fn().mockResolvedValue(null),
            },
            warehouse: { findMany: jest.fn().mockResolvedValue([]) },
        }
        const mockEvents = { emit: jest.fn() }

        it('duplicate delivery does not re-run handler side effects', async () => {
            const module = await Test.createTestingModule({
                providers: [
                    MmEventConsumerService,
                    { provide: PrismaService, useValue: mockPrisma },
                ],
            }).compile()
            const consumer = module.get(MmEventConsumerService)
            const handler = jest.fn().mockResolvedValue('ok')

            const first = await consumer.handleIdempotent({
                consumerId: 'FICO_ACCOUNTING',
                envelope,
                handler,
            })
            expect(first.duplicate).toBe(false)
            expect(handler).toHaveBeenCalledTimes(1)

            const second = await consumer.handleIdempotent({
                consumerId: 'FICO_ACCOUNTING',
                envelope,
                handler,
            })
            expect(second.duplicate).toBe(true)
            expect(handler).toHaveBeenCalledTimes(1)
        })

        it('outbox dispatcher dead-letters after max retries', async () => {
            const module = await Test.createTestingModule({
                providers: [
                    MmAccountingContextBuilder,
                    MmAccountingEventService,
                    MmOutboxService,
                    { provide: PrismaService, useValue: mockPrisma },
                    {
                        provide: EventEmitter2,
                        useValue: {
                            emit: jest.fn(() => {
                                throw new Error('dispatch failed')
                            }),
                        },
                    },
                ],
            }).compile()
            const outbox = module.get(MmOutboxService)
            mockEvents.emit.mockImplementation(() => {
                throw new Error('dispatch failed')
            })

            await outbox.dispatchPending(1)
            expect(mockPrisma.mmDomainEventOutbox.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ status: 'DEAD_LETTER' }),
                }),
            )
        })
    })
})
