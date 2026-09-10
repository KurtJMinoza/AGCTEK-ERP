import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { ValuationEngineService } from './valuation-engine.service'
import { MaterialValuationService } from './material-valuation.service'
import { CostLayerService } from './cost-layer.service'

describe('MM-12 Valuation Engine', () => {
    let engine: ValuationEngineService
    let materialValuation: MaterialValuationService
    let costLayers: CostLayerService

    const mockEvents = { emit: jest.fn() }

    const valuationRow = {
        id: 'mv-1',
        companyId: 'co-1',
        materialId: 'mat-1',
        warehouseId: 'wh-1',
        valuationMethod: 'STANDARD_COST',
        standardCost: new Decimal(10),
        movingAverageCost: new Decimal(0),
        revision: 1,
    }

    let txState: any

    function makeTx() {
        txState = {
            valuation: { ...valuationRow },
            layers: [] as any[],
            valTxns: [] as any[],
            acctEvents: [] as any[],
            inventoryTxn: {
                id: 'inv-1',
                unitCost: new Decimal(0),
                totalCost: new Decimal(0),
            },
            onHand: new Decimal(0),
        }

        const tx: any = {
            mmMaterialValuation: {
                findUnique: jest.fn().mockImplementation(async () => txState.valuation),
                create: jest.fn().mockImplementation(async ({ data }) => {
                    txState.valuation = { id: 'mv-1', ...data }
                    return txState.valuation
                }),
                update: jest.fn().mockImplementation(async ({ data }) => {
                    txState.valuation = { ...txState.valuation, ...data }
                    return txState.valuation
                }),
                updateMany: jest.fn().mockImplementation(async ({ data }) => {
                    txState.valuation = { ...txState.valuation, ...data }
                    return { count: 1 }
                }),
            },
            mmMaterial: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'mat-1',
                    valuationMethod: 'STANDARD_COST',
                    standardCost: new Decimal(10),
                    currencyId: null,
                    baseUomId: 'uom-1',
                }),
            },
            mmInventoryBalance: {
                aggregate: jest.fn().mockImplementation(async () => ({
                    _sum: { quantity: txState.onHand },
                })),
            },
            mmCostLayer: {
                create: jest.fn().mockImplementation(async ({ data }) => {
                    const layer = { id: `layer-${txState.layers.length + 1}`, ...data }
                    txState.layers.push(layer)
                    return layer
                }),
                findMany: jest.fn().mockImplementation(async ({ where }) => {
                    return txState.layers.filter((l: any) => {
                        if (where?.receiptTxnId) return l.receiptTxnId === where.receiptTxnId
                        if (where?.status === 'OPEN') {
                            return (
                                l.status === 'OPEN' &&
                                new Decimal(l.remainingQuantity).gt(0)
                            )
                        }
                        return true
                    })
                }),
                findUnique: jest.fn().mockImplementation(async ({ where }) =>
                    txState.layers.find((l: any) => l.id === where.id),
                ),
                update: jest.fn().mockImplementation(async ({ where, data }) => {
                    const idx = txState.layers.findIndex((l: any) => l.id === where.id)
                    txState.layers[idx] = { ...txState.layers[idx], ...data }
                    return txState.layers[idx]
                }),
            },
            mmInventoryValuationTransaction: {
                findUnique: jest.fn().mockResolvedValue(null),
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockImplementation(async ({ data }) => {
                    const row = { id: `vtxn-${txState.valTxns.length + 1}`, ...data }
                    txState.valTxns.push(row)
                    return row
                }),
            },
            mmInventoryTransaction: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockImplementation(async ({ data }) => {
                    const row = { id: `inv-syn-${Date.now()}`, ...data }
                    txState.inventoryTxn = row
                    return row
                }),
                update: jest.fn().mockImplementation(async ({ data }) => {
                    txState.inventoryTxn = { ...txState.inventoryTxn, ...data }
                    return txState.inventoryTxn
                }),
            },
            mmAccountingEvent: {
                create: jest.fn().mockImplementation(async ({ data }) => {
                    txState.acctEvents.push(data)
                    return data
                }),
            },
        }
        return tx
    }

    const mockPrisma: any = {
        mmMaterialValuation: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            upsert: jest.fn(),
        },
        mmInventoryValuationTransaction: {
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
        },
        mmCostLayer: {
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
        },
        mmMaterial: { findFirst: jest.fn(), findUnique: jest.fn() },
        mmStandardCostRevision: { create: jest.fn() },
        mmLandedCost: {
            findMany: jest.fn(),
            count: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        mmLandedCostAllocation: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
        },
        mmInventoryBalance: { findMany: jest.fn(), aggregate: jest.fn() },
        mmGoodsReceiptLine: { findUnique: jest.fn(), findFirst: jest.fn() },
        mmSupplierInvoiceLine: { findFirst: jest.fn() },
        mmPurchaseOrderLine: { findUnique: jest.fn() },
        $transaction: jest.fn(),
    }

    beforeEach(async () => {
        jest.clearAllMocks()
        mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(makeTx()))
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ValuationEngineService,
                MaterialValuationService,
                CostLayerService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: EventEmitter2, useValue: mockEvents },
            ],
        }).compile()

        engine = module.get(ValuationEngineService)
        materialValuation = module.get(MaterialValuationService)
        costLayers = module.get(CostLayerService)
    })

    describe('STANDARD_COST', () => {
        it('receipt values inventory at standard and posts price variance', async () => {
            const tx = makeTx()
            txState.valuation.valuationMethod = 'STANDARD_COST'
            txState.valuation.standardCost = new Decimal(10)
            txState.onHand = new Decimal(5)

            const result = await engine.applyInTransaction(tx, {
                inventoryTxnId: 'inv-1',
                companyId: 'co-1',
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                quantity: new Decimal(5),
                receiptUnitCost: new Decimal(12),
                direction: 1,
                postingDate: new Date(),
                movementType: 'RECEIPT',
            })

            expect(Number(result.unitCost)).toBe(10)
            expect(Number(result.totalCost)).toBe(50)
            expect(txState.valTxns[0].priceVariance.toString()).toBe('10') // (12-10)*5
            expect(txState.acctEvents.some((e: any) => e.eventType === 'PRICE_VARIANCE_POSTED')).toBe(
                true,
            )
            expect(txState.acctEvents.some((e: any) => e.eventType === 'INVENTORY_VALUATION_POSTED')).toBe(
                true,
            )
        })

        it('issue uses standard cost', async () => {
            const tx = makeTx()
            txState.valuation.valuationMethod = 'STANDARD_COST'
            txState.valuation.standardCost = new Decimal(10)

            const result = await engine.applyInTransaction(tx, {
                inventoryTxnId: 'inv-2',
                companyId: 'co-1',
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                quantity: new Decimal(3),
                receiptUnitCost: new Decimal(0),
                direction: -1,
                postingDate: new Date(),
                movementType: 'ISSUE',
            })

            expect(Number(result.unitCost)).toBe(10)
            expect(Number(result.totalCost)).toBe(30)
            expect(txState.valTxns[0].direction).toBe('OUT')
        })
    })

    describe('MOVING_AVERAGE', () => {
        it('updates MAP on receipt without rounding drift across receipts', async () => {
            const tx = makeTx()
            txState.valuation.valuationMethod = 'MOVING_AVERAGE'
            txState.valuation.movingAverageCost = new Decimal(0)

            // First receipt 3 @ 1/3
            txState.onHand = new Decimal(3)
            await engine.applyInTransaction(tx, {
                inventoryTxnId: 'inv-a',
                companyId: 'co-1',
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                quantity: new Decimal(3),
                receiptUnitCost: new Decimal('0.333333'),
                direction: 1,
                postingDate: new Date(),
                movementType: 'RECEIPT',
            })
            const map1 = new Decimal(txState.valuation.movingAverageCost)

            // Second receipt 3 @ 0.333333 — reset findUnique for new txn
            tx.mmInventoryValuationTransaction.findUnique.mockResolvedValue(null)
            txState.onHand = new Decimal(6)
            await engine.applyInTransaction(tx, {
                inventoryTxnId: 'inv-b',
                companyId: 'co-1',
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                quantity: new Decimal(3),
                receiptUnitCost: new Decimal('0.333333'),
                direction: 1,
                postingDate: new Date(),
                movementType: 'RECEIPT',
            })
            const map2 = new Decimal(txState.valuation.movingAverageCost)

            expect(map1.toFixed(6)).toBe('0.333333')
            expect(map2.toFixed(6)).toBe('0.333333')
            expect(txState.valTxns[0].movingAvgAfter.toString()).toBe(map1.toString())
        })

        it('issue uses current MAP and does not change MAP', async () => {
            const tx = makeTx()
            txState.valuation.valuationMethod = 'MOVING_AVERAGE'
            txState.valuation.movingAverageCost = new Decimal(8)

            const result = await engine.applyInTransaction(tx, {
                inventoryTxnId: 'inv-out',
                companyId: 'co-1',
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                quantity: new Decimal(2),
                receiptUnitCost: new Decimal(0),
                direction: -1,
                postingDate: new Date(),
                movementType: 'ISSUE',
            })

            expect(Number(result.unitCost)).toBe(8)
            expect(Number(txState.valuation.movingAverageCost)).toBe(8)
            expect(txState.valTxns[0].movingAvgBefore.toString()).toBe('8')
            expect(txState.valTxns[0].movingAvgAfter.toString()).toBe('8')
        })
    })

    describe('FIFO', () => {
        it('creates cost layer on receipt', async () => {
            const tx = makeTx()
            txState.valuation.valuationMethod = 'FIFO'

            await engine.applyInTransaction(tx, {
                inventoryTxnId: 'inv-fifo-in',
                companyId: 'co-1',
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                quantity: new Decimal(10),
                receiptUnitCost: new Decimal(5),
                direction: 1,
                postingDate: new Date('2026-01-01'),
                movementType: 'RECEIPT',
            })

            expect(txState.layers).toHaveLength(1)
            expect(Number(txState.layers[0].remainingQuantity)).toBe(10)
            expect(Number(txState.layers[0].unitCost)).toBe(5)
        })

        it('consumes oldest layers first on issue', async () => {
            const tx = makeTx()
            txState.valuation.valuationMethod = 'FIFO'
            txState.layers = [
                {
                    id: 'layer-1',
                    remainingQuantity: new Decimal(4),
                    originalQuantity: new Decimal(4),
                    unitCost: new Decimal(5),
                    status: 'OPEN',
                    postingDate: new Date('2026-01-01'),
                    createdAt: new Date('2026-01-01'),
                },
                {
                    id: 'layer-2',
                    remainingQuantity: new Decimal(6),
                    originalQuantity: new Decimal(6),
                    unitCost: new Decimal(7),
                    status: 'OPEN',
                    postingDate: new Date('2026-01-02'),
                    createdAt: new Date('2026-01-02'),
                },
            ]

            // Override findMany order
            tx.mmCostLayer.findMany.mockImplementation(async () =>
                [...txState.layers].sort(
                    (a: any, b: any) =>
                        a.postingDate.getTime() - b.postingDate.getTime(),
                ),
            )

            const result = await engine.applyInTransaction(tx, {
                inventoryTxnId: 'inv-fifo-out',
                companyId: 'co-1',
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                quantity: new Decimal(5),
                receiptUnitCost: new Decimal(0),
                direction: -1,
                postingDate: new Date(),
                movementType: 'ISSUE',
            })

            // 4*5 + 1*7 = 27 → unit 5.4
            expect(Number(result.totalCost)).toBe(27)
            expect(Number(result.unitCost)).toBe(5.4)
            expect(Number(txState.layers[0].remainingQuantity)).toBe(0)
            expect(txState.layers[0].status).toBe('DEPLETED')
            expect(Number(txState.layers[1].remainingQuantity)).toBe(5)
            expect(txState.valTxns[0].layerConsumptions).toHaveLength(2)
        })
    })

    describe('Reversal', () => {
        it('restores MAP from snapshot without rewriting history', async () => {
            const tx = makeTx()
            const original = {
                id: 'vtxn-orig',
                inventoryTxnId: 'inv-orig',
                companyId: 'co-1',
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                valuationMethod: 'MOVING_AVERAGE',
                direction: 'IN',
                quantity: new Decimal(10),
                unitCost: new Decimal(5),
                totalCost: new Decimal(50),
                priceVariance: new Decimal(0),
                movingAvgBefore: new Decimal(4),
                movingAvgAfter: new Decimal(5),
                layerConsumptions: null,
            }
            tx.mmInventoryValuationTransaction.findUnique
                .mockResolvedValueOnce(original) // by inventoryTxnId
                .mockResolvedValueOnce(null) // by reversalOfId

            const result = await engine.reverseInTransaction(
                tx,
                'inv-orig',
                'inv-rev',
            )

            expect(result).not.toBeNull()
            expect(Number(txState.valuation.movingAverageCost)).toBe(4)
            expect(txState.valTxns[0].direction).toBe('REVERSAL')
            expect(txState.valTxns[0].reversalOfId).toBe('vtxn-orig')
            expect(
                txState.acctEvents.some(
                    (e: any) => e.eventType === 'INVENTORY_VALUATION_REVERSED',
                ),
            ).toBe(true)
        })

        it('restores FIFO layer remaining qty on issue reversal', async () => {
            const tx = makeTx()
            txState.layers = [
                {
                    id: 'layer-1',
                    remainingQuantity: new Decimal(0),
                    originalQuantity: new Decimal(10),
                    unitCost: new Decimal(5),
                    status: 'DEPLETED',
                },
            ]
            const original = {
                id: 'vtxn-out',
                inventoryTxnId: 'inv-out',
                companyId: 'co-1',
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                valuationMethod: 'FIFO',
                direction: 'OUT',
                quantity: new Decimal(4),
                unitCost: new Decimal(5),
                totalCost: new Decimal(20),
                priceVariance: new Decimal(0),
                movingAvgBefore: null,
                movingAvgAfter: null,
                layerConsumptions: [
                    { layerId: 'layer-1', qty: '4', unitCost: '5' },
                ],
            }
            tx.mmInventoryValuationTransaction.findUnique
                .mockResolvedValueOnce(original)
                .mockResolvedValueOnce(null)

            await engine.reverseInTransaction(tx, 'inv-out', 'inv-rev')

            expect(Number(txState.layers[0].remainingQuantity)).toBe(4)
            expect(txState.layers[0].status).toBe('OPEN')
        })
    })

    describe('Material valuation config', () => {
        it('rejects LIFO', async () => {
            mockPrisma.mmMaterial.findFirst.mockResolvedValue({
                id: 'mat-1',
                standardCost: 1,
                currencyId: null,
            })
            await expect(
                materialValuation.upsert({
                    companyId: 'co-1',
                    materialId: 'mat-1',
                    warehouseId: 'wh-1',
                    valuationMethod: 'LIFO' as any,
                }),
            ).rejects.toThrow(BadRequestException)
        })
    })

    describe('CostLayerService', () => {
        it('throws when insufficient layers', async () => {
            const tx = makeTx()
            tx.mmCostLayer.findMany.mockResolvedValue([])
            await expect(
                costLayers.consumeFifo(tx, {
                    companyId: 'co-1',
                    materialId: 'mat-1',
                    warehouseId: 'wh-1',
                    quantity: new Decimal(1),
                }),
            ).rejects.toThrow(BadRequestException)
        })
    })

    describe('Landed cost capitalization', () => {
        it('increases MAP and posts LANDED_COST accounting', async () => {
            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                const tx = makeTx()
                txState.valuation.valuationMethod = 'MOVING_AVERAGE'
                txState.valuation.movingAverageCost = new Decimal(10)
                txState.onHand = new Decimal(10)
                return fn(tx)
            })

            const result = await engine.applyLandedCost({
                companyId: 'co-1',
                warehouseId: 'wh-1',
                materialId: 'mat-1',
                allocatedAmount: 20,
                landedCostId: 'lc-1',
            })

            expect(result).toBeDefined()
            expect(Number(txState.valuation.movingAverageCost)).toBe(12) // (10*10+20)/10
            expect(txState.acctEvents.some((e: any) => e.eventType === 'LANDED_COST_POSTED')).toBe(
                true,
            )
        })

        it('raises FIFO layer unitCost without changing remaining qty', async () => {
            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                const tx = makeTx()
                txState.valuation.valuationMethod = 'FIFO'
                txState.onHand = new Decimal(10)
                txState.layers.push({
                    id: 'layer-1',
                    status: 'OPEN',
                    remainingQuantity: new Decimal(10),
                    originalQuantity: new Decimal(10),
                    unitCost: new Decimal(5),
                    receiptTxnId: 'inv-old',
                })
                return fn(tx)
            })

            await engine.applyLandedCost({
                companyId: 'co-1',
                warehouseId: 'wh-1',
                materialId: 'mat-1',
                allocatedAmount: 10,
                landedCostId: 'lc-1',
            })

            expect(Number(txState.layers[0].remainingQuantity)).toBe(10)
            expect(Number(txState.layers[0].unitCost)).toBe(6) // 5 + 10/10
        })

        it('STANDARD_COST posts variance and leaves standard unchanged', async () => {
            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                const tx = makeTx()
                txState.valuation.valuationMethod = 'STANDARD_COST'
                txState.valuation.standardCost = new Decimal(10)
                txState.onHand = new Decimal(5)
                return fn(tx)
            })

            const result = await engine.applyLandedCost({
                companyId: 'co-1',
                warehouseId: 'wh-1',
                materialId: 'mat-1',
                allocatedAmount: 15,
                landedCostId: 'lc-1',
            })

            expect(Number(txState.valuation.standardCost)).toBe(10)
            expect(Number(result.priceVariance)).toBe(15)
            expect(
                txState.acctEvents.some((e: any) => e.eventType === 'PRICE_VARIANCE_POSTED'),
            ).toBe(true)
        })
    })

    describe('Revaluation', () => {
        it('creates REVALUATION txn without mutating prior history', async () => {
            const prior = {
                id: 'vtxn-old',
                direction: 'IN',
                unitCost: new Decimal(10),
            }
            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                const tx = makeTx()
                txState.onHand = new Decimal(4)
                txState.valTxns.push(prior)
                return fn(tx)
            })

            const result = await engine.applyRevaluation({
                companyId: 'co-1',
                warehouseId: 'wh-1',
                materialId: 'mat-1',
                oldStandardCost: 10,
                newStandardCost: 12,
            })

            expect(result?.direction).toBe('REVALUATION')
            expect(Number(result?.totalCost)).toBe(8) // 2 * 4
            expect(txState.valTxns[0]).toBe(prior)
            expect(
                txState.acctEvents.some(
                    (e: any) => e.eventType === 'INVENTORY_REVALUATION_POSTED',
                ),
            ).toBe(true)
        })
    })

    describe('Price variance triad enrichment', () => {
        it('attaches PO / receipt / invoice prices when GR links exist', async () => {
            mockPrisma.mmInventoryValuationTransaction.findMany.mockResolvedValue([
                {
                    id: 'v1',
                    valuationNumber: 'VAL-1',
                    materialId: 'mat-1',
                    priceVariance: new Decimal(5),
                    unitCost: new Decimal(10),
                    inventoryTxn: {
                        unitCost: new Decimal(12),
                        sourceDocumentType: 'GOODS_RECEIPT',
                        sourceDocumentId: 'gr-1',
                        sourceDocumentLineId: 'grl-1',
                    },
                    material: { materialCode: 'M1' },
                    warehouse: { name: 'WH' },
                },
            ])
            mockPrisma.mmInventoryValuationTransaction.count.mockResolvedValue(1)
            mockPrisma.mmGoodsReceiptLine.findUnique.mockResolvedValue({
                id: 'grl-1',
                purchaseOrderLineId: 'pol-1',
                purchaseOrderLine: { unitPrice: new Decimal(11) },
            })
            mockPrisma.mmSupplierInvoiceLine.findFirst.mockResolvedValue({
                unitPrice: new Decimal(13),
            })

            const res = await engine.listValuationTransactions({
                priceVarianceOnly: true,
            })

            expect(res.data[0].poUnitPrice).toBe(11)
            expect(res.data[0].receiptUnitPrice).toBe(12)
            expect(res.data[0].invoiceUnitPrice).toBe(13)
        })
    })
})
