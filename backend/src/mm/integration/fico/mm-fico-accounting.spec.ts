/**
 * Phase 3D: MM ↔ FICO accounting event hardening
 */
import { BadRequestException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Test, TestingModule } from '@nestjs/testing'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../../prisma/prisma.service'
import { MmAccountingContextBuilder } from '../../common/mm-accounting-context.builder'
import { MmAccountingEventService } from '../../common/mm-accounting-event.service'
import { MM_ACCOUNTING_EFFECT_HINTS } from '../../common/mm-accounting-event.types'
import { buildIntegrationEnvelope } from '../../common/mm-integration-event.builder'
import { FicoAccountingConsumerService } from '../../../fico/fico-accounting-consumer.service'
import { FicoFinancialPeriodService } from '../../../fico/financial-period.service'
import { FicoJournalService } from '../../../fico/fico-journal.service'
import { MmPostingPeriodGuard } from './mm-posting-period.guard'
import { FINANCIAL_PERIOD_PORT } from './financial-period.port'

describe('MM ↔ FICO Accounting (Phase 3D)', () => {
    const materials = new Map([
        [
            'mat-1',
            {
                id: 'mat-1',
                materialTypeId: 'mt-raw',
                materialType: { code: 'RAW' },
                valuationClassId: 'vc-1',
                valuationClass: { code: '3000' },
                currency: { code: 'USD' },
            },
        ],
    ])
    const warehouses = new Map([
        ['wh-1', { id: 'wh-1', plantId: 'plant-1' }],
    ])

    let accountingEvents: MmAccountingEventService
    let journal: FicoJournalService
    let periodGuard: MmPostingPeriodGuard
    let contextBuilder: MmAccountingContextBuilder
    let consumer: FicoAccountingConsumerService

    const accountingStore = new Map<string, any>()
    const journalStore = new Map<string, any>()
    const periods: any[] = []

    const mockPrisma: any = {
        mmMaterial: {
            findMany: jest.fn(({ where }: any) =>
                Promise.resolve(
                    (where.id?.in ?? []).map((id: string) => materials.get(id)).filter(Boolean),
                ),
            ),
            findFirst: jest.fn(({ where }: any) =>
                Promise.resolve(materials.get(where.id) ?? null),
            ),
        },
        warehouse: {
            findMany: jest.fn(({ where }: any) =>
                Promise.resolve(
                    (where.id?.in ?? []).map((id: string) => warehouses.get(id)).filter(Boolean),
                ),
            ),
        },
        mmAccountingEvent: {
            create: jest.fn(({ data }: any) => {
                if (accountingStore.has(data.idempotencyKey)) {
                    const err: any = new Error('Unique constraint')
                    err.code = 'P2002'
                    throw err
                }
                const row = { id: `acct-${accountingStore.size + 1}`, ...data }
                accountingStore.set(data.idempotencyKey, row)
                return Promise.resolve(row)
            }),
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(accountingStore.get(where.idempotencyKey) ?? null),
            ),
            update: jest.fn(({ where, data }: any) => {
                const row = [...accountingStore.values()].find((r) => r.id === where.id)
                if (row) Object.assign(row, data)
                return Promise.resolve(row)
            }),
        },
        ficoJournalEntry: {
            create: jest.fn(({ data }: any) => {
                if (journalStore.has(data.idempotencyKey)) {
                    const err: any = new Error('Unique constraint')
                    err.code = 'P2002'
                    throw err
                }
                const row = { id: `je-${journalStore.size + 1}`, ...data }
                journalStore.set(data.idempotencyKey, row)
                return Promise.resolve(row)
            }),
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(journalStore.get(where.idempotencyKey) ?? null),
            ),
        },
        ficoFinancialPeriod: {
            findFirst: jest.fn(({ where }: any) => {
                const postingDate = where.startDate?.lte ?? new Date()
                return Promise.resolve(
                    periods.find(
                        (p) =>
                            p.companyId === where.companyId &&
                            p.startDate <= postingDate &&
                            p.endDate >= postingDate,
                    ) ?? null,
                )
            }),
        },
        mmMaterialValuation: { findMany: jest.fn().mockResolvedValue([]) },
    }

    beforeEach(async () => {
        accountingStore.clear()
        journalStore.clear()
        periods.length = 0
        jest.clearAllMocks()

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MmAccountingContextBuilder,
                MmAccountingEventService,
                FicoJournalService,
                FicoFinancialPeriodService,
                FicoAccountingConsumerService,
                MmPostingPeriodGuard,
                {
                    provide: PrismaService,
                    useValue: mockPrisma,
                },
                {
                    provide: EventEmitter2,
                    useValue: { emit: jest.fn() },
                },
                {
                    provide: FINANCIAL_PERIOD_PORT,
                    useFactory: (periodsSvc: FicoFinancialPeriodService) => periodsSvc,
                    inject: [FicoFinancialPeriodService],
                },
            ],
        }).compile()

        accountingEvents = module.get(MmAccountingEventService)
        journal = module.get(FicoJournalService)
        periodGuard = module.get(MmPostingPeriodGuard)
        contextBuilder = module.get(MmAccountingContextBuilder)
        consumer = module.get(FicoAccountingConsumerService)
    })

    async function recordEvent(
        eventType: string,
        documentType: string,
        documentId: string,
        lines: Array<Record<string, unknown>>,
        extra: Record<string, unknown> = {},
    ) {
        const envelope = buildIntegrationEnvelope({
            eventType,
            companyId: 'co-1',
            sourceModule: 'STOCK_OPS',
            sourceEntityType: documentType,
            sourceEntityId: documentId,
            plantId: 'plant-1',
            payload: {
                postingDate: '2026-09-01T00:00:00.000Z',
                warehouseId: 'wh-1',
                lines,
                ...extra,
            },
        })
        return accountingEvents.recordFromEnvelope(mockPrisma, envelope)
    }

    it('GoodsReceiptPosted includes inventory increase + GR/IR hints and account context', async () => {
        const record = await recordEvent('GoodsReceiptPosted', 'GOODS_RECEIPT', 'gr-1', [
            {
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                movementType: 'RECEIPT',
                quantity: 10,
                unitCost: 5,
                totalCost: 50,
            },
        ])

        expect(record.created).toBe(true)
        expect(record.payload?.accountingEffects).toEqual([
            MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_INCREASE,
            MM_ACCOUNTING_EFFECT_HINTS.GRIR_ACCRUAL,
        ])
        expect(record.payload?.lines[0]).toMatchObject({
            materialTypeCode: 'RAW',
            valuationClassCode: '3000',
            plantId: 'plant-1',
        })
        expect(record.payload?.idempotencyKey).toBeTruthy()
    })

    it('GoodsIssuePosted includes COGS + inventory decrease hints', async () => {
        const record = await recordEvent('GoodsIssuePosted', 'GOODS_ISSUE', 'gi-1', [
            {
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                movementType: 'ISSUE',
                quantity: 4,
                unitCost: 5,
                totalCost: 20,
            },
        ], { issuePurpose: 'SALES' })

        expect(record.payload?.accountingEffects).toEqual([
            MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_DECREASE,
            MM_ACCOUNTING_EFFECT_HINTS.COGS_EXPENSE,
        ])
    })

    it('ScrapPosted includes inventory loss hints', async () => {
        const effects = contextBuilder.resolveEffects('ScrapPosted')
        expect(effects).toContain(MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_LOSS)

        const record = await recordEvent('ScrapPosted', 'SCRAP', 'scp-1', [
            {
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                movementType: 'SCRAP',
                quantity: 2,
                unitCost: 5,
                totalCost: 10,
            },
        ])
        expect(record.payload?.accountingEffects).toContain(
            MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_LOSS,
        )
    })

    it('InventoryAdjusted includes adjustment hint', async () => {
        const record = await recordEvent('InventoryAdjusted', 'ADJUSTMENT', 'adj-1', [
            {
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                movementType: 'ADJUSTMENT_IN',
                quantity: 1,
                unitCost: 10,
                totalCost: 10,
            },
        ], { adjustmentReason: 'COUNT_VARIANCE' })

        expect(record.payload?.accountingEffects).toContain(
            MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_ADJUSTMENT,
        )
    })

    it('SupplierReturnPosted includes GR/IR reversal hints', async () => {
        const record = await recordEvent(
            'SupplierReturnPosted',
            'SUPPLIER_RETURN',
            'ret-1',
            [
                {
                    materialId: 'mat-1',
                    warehouseId: 'wh-1',
                    movementType: 'RETURN_OUT',
                    quantity: 3,
                    unitCost: 5,
                    totalCost: 15,
                },
            ],
        )
        expect(record.payload?.accountingEffects).toContain(
            MM_ACCOUNTING_EFFECT_HINTS.GRIR_REVERSAL,
        )
    })

    it('LandedCostAllocated records landed cost accounting event', async () => {
        const record = await accountingEvents.recordStandalone(mockPrisma, {
            eventType: 'LandedCostAllocated',
            sourceModule: 'VALUATION',
            documentType: 'LANDED_COST',
            documentId: 'lc-1',
            companyId: 'co-1',
            postingDate: '2026-09-01T00:00:00.000Z',
            accountingEffects: [MM_ACCOUNTING_EFFECT_HINTS.LANDED_COST],
            lines: [
                {
                    materialId: 'mat-1',
                    warehouseId: 'wh-1',
                    movementType: 'LANDED_COST',
                    quantity: 10,
                    unitCost: 1,
                    totalCost: 10,
                },
            ],
        })
        expect(record.payload?.accountingEffects).toContain(
            MM_ACCOUNTING_EFFECT_HINTS.LANDED_COST,
        )
    })

    it('PriceVariancePosted records price variance accounting event', async () => {
        const record = await accountingEvents.recordStandalone(mockPrisma, {
            eventType: 'PriceVariancePosted',
            sourceModule: 'VALUATION',
            documentType: 'PRICE_VARIANCE',
            documentId: 'pv-1',
            companyId: 'co-1',
            postingDate: '2026-09-01T00:00:00.000Z',
            accountingEffects: [MM_ACCOUNTING_EFFECT_HINTS.PRICE_VARIANCE],
            lines: [
                {
                    materialId: 'mat-1',
                    warehouseId: 'wh-1',
                    movementType: 'PRICE_VARIANCE',
                    quantity: 1,
                    unitCost: 2,
                    totalCost: 2,
                },
            ],
        })
        expect(record.payload?.accountingEffects).toContain(
            MM_ACCOUNTING_EFFECT_HINTS.PRICE_VARIANCE,
        )
    })

    it('duplicate accounting event does not duplicate FICO journal entry', async () => {
        const payload = {
            schemaVersion: 'v2' as const,
            eventType: 'GoodsReceiptPosted',
            companyId: 'co-1',
            postingDate: '2026-09-01T00:00:00.000Z',
            transactionDate: '2026-09-01T00:00:00.000Z',
            currencyCode: 'USD',
            documentType: 'GOODS_RECEIPT',
            documentId: 'gr-dup',
            sourceModule: 'STOCK_OPS',
            accountingEffects: [
                MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_INCREASE,
                MM_ACCOUNTING_EFFECT_HINTS.GRIR_ACCRUAL,
            ],
            lines: [],
            financiallyRelevant: true,
            idempotencyKey: 'GoodsReceiptPosted:GOODS_RECEIPT:gr-dup',
            totalValue: 50,
            mmAccountingEventId: 'acct-1',
        }

        const first = await journal.createFromAccountingEvent(payload)
        const second = await journal.createFromAccountingEvent(payload)

        expect(first.created).toBe(true)
        expect(second.duplicate).toBe(true)
        expect(journalStore.size).toBe(1)
    })

    it('closed financial period blocks MM posting', async () => {
        periods.push({
            companyId: 'co-1',
            fiscalYear: 2026,
            periodNumber: 9,
            startDate: new Date('2026-09-01'),
            endDate: new Date('2026-09-30'),
            status: 'CLOSED',
        })

        await expect(
            periodGuard.assertCanPost('co-1', new Date('2026-09-15')),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('FICO consumer marks accounting event consumed on journal post', async () => {
        accountingStore.set('GoodsReceiptPosted:GOODS_RECEIPT:gr-consume', {
            id: 'acct-consume',
            idempotencyKey: 'GoodsReceiptPosted:GOODS_RECEIPT:gr-consume',
            status: 'PENDING',
        })

        await consumer.handleAccountingEntryRequested({
            schemaVersion: 'v2',
            eventType: 'GoodsReceiptPosted',
            companyId: 'co-1',
            postingDate: '2026-09-01T00:00:00.000Z',
            transactionDate: '2026-09-01T00:00:00.000Z',
            currencyCode: 'USD',
            documentType: 'GOODS_RECEIPT',
            documentId: 'gr-consume',
            sourceModule: 'STOCK_OPS',
            accountingEffects: [MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_INCREASE],
            lines: [],
            financiallyRelevant: true,
            idempotencyKey: 'GoodsReceiptPosted:GOODS_RECEIPT:gr-consume',
            totalValue: 50,
            mmAccountingEventId: 'acct-consume',
        })

        expect(mockPrisma.mmAccountingEvent.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'acct-consume' },
                data: expect.objectContaining({ status: 'CONSUMED' }),
            }),
        )
    })
})
