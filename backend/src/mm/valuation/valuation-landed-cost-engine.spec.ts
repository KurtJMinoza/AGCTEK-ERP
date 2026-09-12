/**
 * Phase 9: Valuation + Landed Cost engine scenarios
 */
import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { ValuationEngineService } from './valuation-engine.service'
import { MaterialValuationService } from './material-valuation.service'
import { CostLayerService } from './cost-layer.service'
import { LandedCostService } from './landed-cost.service'
import { PriceVarianceService } from './price-variance.service'
import { CostElementService } from './cost-element.service'
import { FifoValuationStrategy } from './strategies/fifo-valuation.strategy'
import { MovingAverageValuationStrategy } from './strategies/moving-average-valuation.strategy'
import { StandardCostValuationStrategy } from './strategies/standard-cost-valuation.strategy'
import { ValuationMethodRegistry } from './strategies/valuation-method.registry'
import { normalizeAllocationBase } from './valuation.constants'

describe('Valuation Landed Cost Engine (Phase 9)', () => {
    let engine: ValuationEngineService
    let costLayers: CostLayerService
    let landedCosts: LandedCostService
    let costElements: CostElementService
    let priceVariances: PriceVarianceService
    let mockPrisma: any
    let mockEvents: { emit: jest.Mock }
    let txState: any

    function makeTx() {
        txState = {
            valuation: {
                id: 'mv-1',
                companyId: 'co-1',
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                valuationMethod: 'FIFO',
                standardCost: new Decimal(10),
                movingAverageCost: new Decimal(0),
            },
            layers: [] as any[],
            valTxns: [] as any[],
            acctEvents: [] as any[],
            priceVariances: [] as any[],
            onHand: new Decimal(0),
            inventoryTxn: { id: 'inv-1' },
        }

        return {
            mmMaterialValuation: {
                findUnique: jest.fn().mockImplementation(async () => txState.valuation),
                update: jest.fn().mockImplementation(async ({ data }: any) => {
                    txState.valuation = { ...txState.valuation, ...data }
                    return txState.valuation
                }),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                create: jest.fn(),
            },
            mmMaterial: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'mat-1',
                    valuationMethod: 'FIFO',
                    standardCost: new Decimal(10),
                    currencyId: null,
                }),
            },
            mmInventoryBalance: {
                aggregate: jest.fn().mockImplementation(async () => ({
                    _sum: { quantity: txState.onHand },
                })),
            },
            mmCostLayer: {
                create: jest.fn().mockImplementation(async ({ data }: any) => {
                    const layer = {
                        id: `layer-${txState.layers.length + 1}`,
                        status: 'OPEN',
                        ...data,
                    }
                    txState.layers.push(layer)
                    return layer
                }),
                findFirst: jest.fn().mockImplementation(async ({ where }: any) =>
                    txState.layers.find(
                        (l: any) =>
                            l.receiptTxnId === where.receiptTxnId &&
                            l.status !== 'REVERSED',
                    ),
                ),
                findMany: jest.fn().mockImplementation(async ({ where }: any) => {
                    return txState.layers.filter((l: any) => {
                        if (where?.receiptTxnId)
                            return l.receiptTxnId === where.receiptTxnId
                        if (where?.status === 'OPEN') {
                            return (
                                l.status === 'OPEN' &&
                                new Decimal(l.remainingQuantity).gt(0)
                            )
                        }
                        return true
                    })
                }),
                findUnique: jest.fn().mockImplementation(async ({ where }: any) =>
                    txState.layers.find((l: any) => l.id === where.id),
                ),
                update: jest.fn().mockImplementation(async ({ where, data }: any) => {
                    const idx = txState.layers.findIndex((l: any) => l.id === where.id)
                    txState.layers[idx] = { ...txState.layers[idx], ...data }
                    return txState.layers[idx]
                }),
            },
            mmInventoryValuationTransaction: {
                findUnique: jest.fn().mockResolvedValue(null),
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockImplementation(async ({ data }: any) => {
                    const row = {
                        id: `vtxn-${txState.valTxns.length + 1}`,
                        ...data,
                    }
                    txState.valTxns.push(row)
                    return row
                }),
            },
            mmInventoryTransaction: {
                update: jest.fn().mockResolvedValue({}),
                findUnique: jest.fn(),
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockImplementation(async ({ data }: any) => ({
                    id: `inv-syn-${txState.valTxns.length + 1}`,
                    ...data,
                })),
            },
            mmAccountingEvent: {
                create: jest.fn().mockImplementation(async ({ data }: any) => {
                    txState.acctEvents.push(data)
                    return data
                }),
            },
            mmPriceVariance: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockImplementation(async ({ data }: any) => {
                    const row = {
                        id: `pv-${txState.priceVariances.length + 1}`,
                        ...data,
                    }
                    txState.priceVariances.push(row)
                    return row
                }),
            },
        }
    }

    beforeEach(async () => {
        mockEvents = { emit: jest.fn() }
        mockPrisma = {
            mmMaterialValuation: {
                findUnique: jest.fn(),
                findMany: jest.fn(),
                count: jest.fn(),
                upsert: jest.fn(),
                update: jest.fn(),
            },
            mmCostLayer: {
                findMany: jest.fn().mockResolvedValue([]),
                count: jest.fn().mockResolvedValue(0),
                findFirst: jest.fn(),
                create: jest.fn(),
            },
            mmInventoryTransaction: { findUnique: jest.fn() },
            mmInventoryValuationTransaction: {
                findMany: jest.fn().mockResolvedValue([]),
                count: jest.fn().mockResolvedValue(0),
            },
            mmLandedCost: {
                findMany: jest.fn(),
                count: jest.fn(),
                findUnique: jest.fn(),
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
                update: jest.fn(),
            },
            mmLandedCostAllocation: {
                deleteMany: jest.fn(),
                createMany: jest.fn(),
            },
            mmCostElement: {
                findMany: jest.fn().mockResolvedValue([]),
                count: jest.fn().mockResolvedValue(0),
                findUnique: jest.fn(),
                upsert: jest.fn().mockImplementation(async ({ create }: any) => ({
                    id: 'ce-1',
                    ...create,
                })),
            },
            mmPriceVariance: {
                findMany: jest.fn().mockResolvedValue([]),
                count: jest.fn().mockResolvedValue(0),
            },
            mmInventoryBalance: { aggregate: jest.fn(), findMany: jest.fn() },
            $transaction: jest.fn(async (fn: any) => fn(makeTx())),
        }

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ValuationEngineService,
                MaterialValuationService,
                CostLayerService,
                LandedCostService,
                PriceVarianceService,
                CostElementService,
                FifoValuationStrategy,
                MovingAverageValuationStrategy,
                StandardCostValuationStrategy,
                ValuationMethodRegistry,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: EventEmitter2, useValue: mockEvents },
            ],
        }).compile()

        engine = module.get(ValuationEngineService)
        costLayers = module.get(CostLayerService)
        landedCosts = module.get(LandedCostService)
        costElements = module.get(CostElementService)
        priceVariances = module.get(PriceVarianceService)
    })

    it('1) FIFO receipt creates cost layer', async () => {
        const tx = makeTx()
        txState.valuation.valuationMethod = 'FIFO'
        txState.onHand = new Decimal(10)
        await engine.applyInTransaction(tx as any, {
            inventoryTxnId: 'inv-r1',
            companyId: 'co-1',
            materialId: 'mat-1',
            warehouseId: 'wh-1',
            quantity: new Decimal(10),
            receiptUnitCost: new Decimal(5),
            direction: 1,
            postingDate: new Date(),
            movementType: 'RECEIPT',
        })
        expect(txState.layers).toHaveLength(1)
        expect(Number(txState.layers[0].unitCost)).toBe(5)
        expect(txState.layers[0].receiptTxnId).toBe('inv-r1')
    })

    it('2) FIFO issue consumes chronological layers', async () => {
        const tx = makeTx()
        txState.valuation.valuationMethod = 'FIFO'
        txState.layers = [
            {
                id: 'layer-1',
                companyId: 'co-1',
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                batchId: null,
                status: 'OPEN',
                remainingQuantity: new Decimal(10),
                originalQuantity: new Decimal(10),
                unitCost: new Decimal(4),
                postingDate: new Date('2026-01-01'),
                createdAt: new Date('2026-01-01'),
            },
            {
                id: 'layer-2',
                companyId: 'co-1',
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                batchId: null,
                status: 'OPEN',
                remainingQuantity: new Decimal(10),
                originalQuantity: new Decimal(10),
                unitCost: new Decimal(6),
                postingDate: new Date('2026-02-01'),
                createdAt: new Date('2026-02-01'),
            },
        ]
        const result = await engine.applyInTransaction(tx as any, {
            inventoryTxnId: 'inv-i1',
            companyId: 'co-1',
            materialId: 'mat-1',
            warehouseId: 'wh-1',
            quantity: new Decimal(12),
            receiptUnitCost: new Decimal(0),
            direction: -1,
            postingDate: new Date(),
            movementType: 'ISSUE',
        })
        expect(Number(result.totalCost)).toBe(4 * 10 + 6 * 2)
        expect(txState.valTxns[0].layerConsumptions).toHaveLength(2)
    })

    it('3) moving average receipt recalculates MAP', async () => {
        const tx = makeTx()
        txState.valuation.valuationMethod = 'MOVING_AVERAGE'
        txState.valuation.movingAverageCost = new Decimal(10)
        txState.onHand = new Decimal(20) // includes this receipt of 10
        await engine.applyInTransaction(tx as any, {
            inventoryTxnId: 'inv-m1',
            companyId: 'co-1',
            materialId: 'mat-1',
            warehouseId: 'wh-1',
            quantity: new Decimal(10),
            receiptUnitCost: new Decimal(20),
            direction: 1,
            postingDate: new Date(),
            movementType: 'RECEIPT',
        })
        // (10*10 + 10*20) / 20 = 15
        expect(Number(txState.valuation.movingAverageCost)).toBe(15)
    })

    it('4) standard cost valuation uses standard + PPV', async () => {
        const tx = makeTx()
        txState.valuation.valuationMethod = 'STANDARD_COST'
        txState.valuation.standardCost = new Decimal(8)
        txState.onHand = new Decimal(5)
        const result = await engine.applyInTransaction(tx as any, {
            inventoryTxnId: 'inv-s1',
            companyId: 'co-1',
            materialId: 'mat-1',
            warehouseId: 'wh-1',
            quantity: new Decimal(5),
            receiptUnitCost: new Decimal(11),
            direction: 1,
            postingDate: new Date(),
            movementType: 'RECEIPT',
        })
        expect(Number(result.unitCost)).toBe(8)
        expect(Number(txState.valTxns[0].priceVariance)).toBe(15) // (11-8)*5
        expect(txState.priceVariances[0].varianceType).toBe('PPV')
    })

    it('5) landed cost allocation QUANTITY capitalizes', async () => {
        const doc: any = {
            id: 'lc-1',
            companyId: 'co-1',
            warehouseId: 'wh-1',
            allocationBase: 'QUANTITY',
            totalAmount: new Decimal(100),
            status: 'DRAFT',
            lines: [
                {
                    materialId: 'mat-1',
                    quantity: new Decimal(4),
                    amount: new Decimal(100),
                },
            ],
            allocations: [],
        }
        mockPrisma.mmLandedCost.findUnique.mockImplementation(async () => ({ ...doc }))
        mockPrisma.mmLandedCost.update.mockImplementation(async ({ data }: any) => {
            Object.assign(doc, data)
            return { ...doc }
        })
        jest.spyOn(engine, 'applyLandedCost').mockResolvedValue({
            unitCost: new Decimal(25),
            totalCost: new Decimal(100),
            valuationTxnId: 'v-lc',
        } as any)

        const result = await landedCosts.allocate('lc-1', { warehouseId: 'wh-1' })
        expect(engine.applyLandedCost).toHaveBeenCalled()
        expect(result.status).toBe('ALLOCATED')
    })

    it('6) price variance document listable', async () => {
        mockPrisma.mmPriceVariance.findMany.mockResolvedValue([
            {
                id: 'pv-1',
                varianceNumber: 'PV-1',
                varianceType: 'PPV',
                varianceAmount: new Decimal(10),
            },
        ])
        mockPrisma.mmPriceVariance.count.mockResolvedValue(1)
        const res = await priceVariances.findAll({ companyId: 'co-1' })
        expect(res.data).toHaveLength(1)
        expect(res.data[0].varianceType).toBe('PPV')
    })

    it('7) return (RETURN_IN) valued via engine', async () => {
        const tx = makeTx()
        txState.valuation.valuationMethod = 'MOVING_AVERAGE'
        txState.valuation.movingAverageCost = new Decimal(12)
        txState.onHand = new Decimal(2)
        const result = await engine.applyInTransaction(tx as any, {
            inventoryTxnId: 'inv-ret',
            companyId: 'co-1',
            materialId: 'mat-1',
            warehouseId: 'wh-1',
            quantity: new Decimal(2),
            receiptUnitCost: new Decimal(12),
            direction: 1,
            postingDate: new Date(),
            movementType: 'RETURN_IN',
        })
        expect(Number(result.unitCost)).toBe(12)
        expect(txState.valTxns[0].direction).toBe('IN')
    })

    it('8) scrap (SCRAP outbound) valued via engine', async () => {
        const tx = makeTx()
        txState.valuation.valuationMethod = 'STANDARD_COST'
        txState.valuation.standardCost = new Decimal(9)
        const result = await engine.applyInTransaction(tx as any, {
            inventoryTxnId: 'inv-scrap',
            companyId: 'co-1',
            materialId: 'mat-1',
            warehouseId: 'wh-1',
            quantity: new Decimal(3),
            receiptUnitCost: new Decimal(0),
            direction: -1,
            postingDate: new Date(),
            movementType: 'SCRAP',
        })
        expect(Number(result.unitCost)).toBe(9)
        expect(Number(result.totalCost)).toBe(27)
        expect(txState.valTxns[0].direction).toBe('OUT')
    })

    it('9) inventory adjustment valued via engine', async () => {
        const tx = makeTx()
        txState.valuation.valuationMethod = 'FIFO'
        txState.onHand = new Decimal(1)
        await engine.applyInTransaction(tx as any, {
            inventoryTxnId: 'inv-adj',
            companyId: 'co-1',
            materialId: 'mat-1',
            warehouseId: 'wh-1',
            quantity: new Decimal(1),
            receiptUnitCost: new Decimal(7),
            direction: 1,
            postingDate: new Date(),
            movementType: 'ADJUSTMENT_IN',
        })
        expect(txState.layers[0].unitCost.toString()).toBe('7')
    })

    it('CUSTOM allocation base normalizes to MANUAL', () => {
        expect(normalizeAllocationBase('CUSTOM')).toBe('MANUAL')
        expect(normalizeAllocationBase('VALUE')).toBe('VALUE')
    })

    it('cost elements ensureDefaults seeds DUTY', async () => {
        const rows = await costElements.ensureDefaults('co-1')
        expect(rows.some((r) => r.costType === 'DUTY')).toBe(true)
        expect(mockPrisma.mmCostElement.upsert).toHaveBeenCalled()
    })

    it('controlled POST cost-layer requires receipt txn', async () => {
        mockPrisma.mmInventoryTransaction.findUnique.mockResolvedValue({
            id: 'inv-r',
            companyId: 'co-1',
            materialId: 'mat-1',
            warehouseId: 'wh-1',
            batchId: null,
            movementType: 'RECEIPT',
            signedQuantity: new Decimal(5),
            baseQuantity: new Decimal(5),
            quantity: new Decimal(5),
            unitCost: new Decimal(3),
            postingDate: new Date(),
            sourceDocumentId: 'gr-1',
        })
        mockPrisma.mmCostLayer.findFirst.mockResolvedValue(null)
        mockPrisma.mmCostLayer.create.mockResolvedValue({
            id: 'layer-x',
            receiptTxnId: 'inv-r',
        })
        const layer = await costLayers.createFromReceiptTxn({ receiptTxnId: 'inv-r' })
        expect(layer.receiptTxnId).toBe('inv-r')
    })
})
