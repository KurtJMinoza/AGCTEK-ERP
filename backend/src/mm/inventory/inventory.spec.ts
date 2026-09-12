import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InventoryPostingService } from './inventory-posting.service'
import { PrismaService } from '../../prisma/prisma.service'
import { ValuationEngineService } from '../valuation/valuation-engine.service'
import { UomConversionsService } from '../uom-conversions/uom-conversions.service'
import { MmScopeService } from '../common/mm-scope.service'
import { MmDomainEventsService } from '../common/mm-domain-events.service'
import {
    BadRequestException,
    NotFoundException,
    ConflictException,
} from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'

const activeMaterial = (overrides: any = {}) => ({
    id: 'mat-1',
    status: 'ACTIVE',
    inventoryManaged: true,
    batchManaged: false,
    serialManaged: false,
    negativeStockAllowed: false,
    ...overrides,
})

const activeWarehouse = {
    id: 'wh-1',
    companyId: 'co-1',
    status: 'ACTIVE',
    deletedAt: null,
    plantId: 'plant-1',
}
const activeBin = {
    id: 'bin-1',
    status: 'ACTIVE',
    deletedAt: null,
    storageSection: { storageType: { warehouseId: 'wh-1' } },
}
const activeUom = { id: 'uom-1', deletedAt: null }
const activeBatch = { id: 'batch-1', materialId: 'mat-1', deletedAt: null }
const activeSerial = { id: 'serial-1', materialId: 'mat-1', deletedAt: null }

function baseDto(overrides: any = {}) {
    return {
        companyId: 'co-1',
        warehouseId: 'wh-1',
        materialId: 'mat-1',
        movementType: 'RECEIPT',
        quantity: 100,
        uomId: 'uom-1',
        postingDate: '2026-01-15',
        documentDate: '2026-01-15',
        ...overrides,
    }
}

let txnSeq = 0
function mockTxn(data: any) {
    txnSeq++
    return {
        id: `txn-${txnSeq}`,
        transactionNumber: `TXN-20260115-${String(txnSeq).padStart(5, '0')}`,
        ...data,
    }
}

const mockPrisma: any = {
    mmInventoryTransaction: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
    },
    mmInventoryBalance: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
    },
    mmInventoryAudit: {
        create: jest.fn(),
    },
    mmMaterial: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
    },
    warehouse: { findFirst: jest.fn() },
    wmStorageBin: { findFirst: jest.fn() },
    mmUom: { findFirst: jest.fn() },
    mmBatch: { findFirst: jest.fn() },
    mmSerialNumber: { findFirst: jest.fn() },
    $transaction: jest.fn(),
}

describe('Inventory Ledger Engine', () => {
    let service: InventoryPostingService
    let events: EventEmitter2
    let uomConversions: { toBaseUom: jest.Mock }

    beforeEach(async () => {
        txnSeq = 0
        jest.clearAllMocks()

        uomConversions = {
            toBaseUom: jest.fn().mockImplementation(async (_matId: string, uomId: string, quantity: any) => ({
                quantity: new Decimal(quantity),
                baseUomId: uomId,
            })),
        }

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InventoryPostingService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: EventEmitter2, useValue: { emit: jest.fn() } },
                {
                    provide: ValuationEngineService,
                    useValue: {
                        applyInTransaction: jest.fn().mockResolvedValue({
                            unitCost: new Decimal(0),
                            totalCost: new Decimal(0),
                            valuationTxnId: 'val-1',
                        }),
                        reverseInTransaction: jest.fn().mockResolvedValue(null),
                    },
                },
                { provide: UomConversionsService, useValue: uomConversions },
                {
                    provide: MmScopeService,
                    useValue: { assertPostingScope: jest.fn().mockResolvedValue(undefined) },
                },
                {
                    provide: MmDomainEventsService,
                    useValue: {
                        inventoryTransactionPosted: jest.fn(),
                        inventoryTransactionReversed: jest.fn(),
                    },
                },
            ],
        }).compile()

        service = module.get(InventoryPostingService)
        events = module.get(EventEmitter2)

        mockPrisma.mmMaterial.findFirst.mockResolvedValue(activeMaterial())
        mockPrisma.warehouse.findFirst.mockResolvedValue(activeWarehouse)
        mockPrisma.wmStorageBin.findFirst.mockResolvedValue(activeBin)
        mockPrisma.mmUom.findFirst.mockResolvedValue(activeUom)
        mockPrisma.mmBatch.findFirst.mockResolvedValue(activeBatch)
        mockPrisma.mmSerialNumber.findFirst.mockResolvedValue(activeSerial)
        mockPrisma.mmInventoryTransaction.findUnique.mockResolvedValue(null)
        mockPrisma.mmInventoryBalance.findFirst.mockResolvedValue(null)

        mockPrisma.$transaction.mockImplementation(async (fn: any) => {
            const created = { current: null as any }
            const txClient = {
                mmInventoryTransaction: {
                    create: jest.fn().mockImplementation(({ data }) => {
                        created.current = mockTxn(data)
                        return created.current
                    }),
                    findFirst: jest.fn().mockResolvedValue(null),
                    findUnique: jest.fn().mockImplementation(() => created.current),
                },
                mmInventoryBalance: {
                    findFirst: jest.fn().mockResolvedValue(null),
                    create: jest.fn().mockImplementation(({ data }) => ({ id: 'bal-new', ...data })),
                    update: jest.fn().mockImplementation(({ data }) => data),
                    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                },
                mmInventoryAudit: {
                    create: jest.fn(),
                },
            }
            return fn(txClient)
        })
    })

    describe('Receipt', () => {
        it('should create a transaction and balance for RECEIPT', async () => {
            const result = await service.postTransaction(baseDto())

            expect(result).toBeDefined()
            expect(result.transactionNumber).toMatch(/^TXN-/)
            expect(result.movementType).toBe('RECEIPT')
            expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
            expect(events.emit).toHaveBeenCalledWith(
                'inventory.transaction.posted',
                expect.anything(),
            )
            expect(events.emit).toHaveBeenCalledWith(
                'inventory.stock.changed',
                expect.objectContaining({ materialId: 'mat-1' }),
            )
        })

        it('should increment existing balance on second RECEIPT', async () => {
            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                const txClient = {
                    mmInventoryTransaction: (() => {
                        const created = { current: null as any }
                        return {
                            create: jest.fn().mockImplementation(({ data }) => {
                                created.current = mockTxn(data)
                                return created.current
                            }),
                            findFirst: jest.fn().mockResolvedValue(null),
                            findUnique: jest.fn().mockImplementation(() => created.current),
                        }
                    })(),
                    mmInventoryBalance: {
                        findFirst: jest.fn().mockResolvedValue({
                            id: 'bal-1',
                            quantity: new Decimal(200),
                            reservedQuantity: new Decimal(0),
                            availableQuantity: new Decimal(200),
                            version: 1,
                        }),
                        update: jest.fn().mockResolvedValue({}),
                        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                    },
                    mmInventoryAudit: { create: jest.fn() },
                }
                return fn(txClient)
            })

            const result = await service.postTransaction(baseDto({ quantity: 50 }))
            expect(result).toBeDefined()
        })
    })

    describe('Issue', () => {
        it('should decrement balance for ISSUE with sufficient stock', async () => {
            mockPrisma.mmInventoryBalance.findFirst.mockResolvedValue({
                id: 'bal-1',
                quantity: new Decimal(200),
                reservedQuantity: new Decimal(0),
                availableQuantity: new Decimal(200),
            })

            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                const txClient = {
                    mmInventoryTransaction: (() => {
                        const created = { current: null as any }
                        return {
                            create: jest.fn().mockImplementation(({ data }) => {
                                created.current = mockTxn(data)
                                return created.current
                            }),
                            findFirst: jest.fn().mockResolvedValue(null),
                            findUnique: jest.fn().mockImplementation(() => created.current),
                        }
                    })(),
                    mmInventoryBalance: {
                        findFirst: jest.fn().mockResolvedValue({
                            id: 'bal-1',
                            quantity: new Decimal(200),
                            reservedQuantity: new Decimal(0),
                            availableQuantity: new Decimal(200),
                            version: 1,
                        }),
                        update: jest.fn().mockResolvedValue({}),
                        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                    },
                    mmInventoryAudit: { create: jest.fn() },
                }
                return fn(txClient)
            })

            const result = await service.postTransaction(
                baseDto({ movementType: 'ISSUE', quantity: 50 }),
            )
            expect(result.movementType).toBe('ISSUE')
        })
    })

    describe('Transfer (OUT + IN)', () => {
        it('should handle TRANSFER_OUT followed by TRANSFER_IN', async () => {
            mockPrisma.mmInventoryBalance.findFirst.mockResolvedValue({
                id: 'bal-1',
                quantity: new Decimal(100),
                reservedQuantity: new Decimal(0),
                availableQuantity: new Decimal(100),
            })

            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                const txClient = {
                    mmInventoryTransaction: (() => {
                        const created = { current: null as any }
                        return {
                            create: jest.fn().mockImplementation(({ data }) => {
                                created.current = mockTxn(data)
                                return created.current
                            }),
                            findFirst: jest.fn().mockResolvedValue(null),
                            findUnique: jest.fn().mockImplementation(() => created.current),
                        }
                    })(),
                    mmInventoryBalance: {
                        findFirst: jest.fn().mockResolvedValue({
                            id: 'bal-1',
                            quantity: new Decimal(100),
                            reservedQuantity: new Decimal(0),
                            availableQuantity: new Decimal(100),
                            version: 1,
                        }),
                        update: jest.fn().mockResolvedValue({}),
                        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                        create: jest.fn().mockImplementation(({ data }) => ({ id: 'bal-new', ...data })),
                    },
                    mmInventoryAudit: { create: jest.fn() },
                }
                return fn(txClient)
            })

            const outResult = await service.postTransaction(
                baseDto({ movementType: 'TRANSFER_OUT', quantity: 30, warehouseId: 'wh-1' }),
            )
            expect(outResult.movementType).toBe('TRANSFER_OUT')

            mockPrisma.mmInventoryBalance.findFirst.mockResolvedValue(null)
            const inResult = await service.postTransaction(
                baseDto({ movementType: 'TRANSFER_IN', quantity: 30, warehouseId: 'wh-2' }),
            )
            expect(inResult.movementType).toBe('TRANSFER_IN')
        })
    })

    describe('Insufficient stock', () => {
        it('should reject ISSUE when available stock is insufficient', async () => {
            mockPrisma.mmInventoryBalance.findFirst.mockResolvedValue({
                quantity: new Decimal(10),
                reservedQuantity: new Decimal(0),
                availableQuantity: new Decimal(10),
            })

            await expect(
                service.postTransaction(baseDto({ movementType: 'ISSUE', quantity: 50 })),
            ).rejects.toThrow(BadRequestException)
        })

        it('should reject when no balance exists for outbound', async () => {
            mockPrisma.mmInventoryBalance.findFirst.mockResolvedValue(null)

            await expect(
                service.postTransaction(baseDto({ movementType: 'ISSUE', quantity: 1 })),
            ).rejects.toThrow(BadRequestException)
        })
    })

    describe('Batch-controlled stock', () => {
        it('should require batchId for batch-managed material', async () => {
            mockPrisma.mmMaterial.findFirst.mockResolvedValue(
                activeMaterial({ batchManaged: true }),
            )

            await expect(
                service.postTransaction(baseDto()),
            ).rejects.toThrow('Batch ID is required')
        })

        it('should accept RECEIPT with batchId for batch-managed material', async () => {
            mockPrisma.mmMaterial.findFirst.mockResolvedValue(
                activeMaterial({ batchManaged: true }),
            )

            const result = await service.postTransaction(
                baseDto({ batchId: 'batch-1' }),
            )
            expect(result).toBeDefined()
        })
    })

    describe('Serial-controlled stock', () => {
        it('should require serialNumberId for serial-managed material', async () => {
            mockPrisma.mmMaterial.findFirst.mockResolvedValue(
                activeMaterial({ serialManaged: true }),
            )

            await expect(
                service.postTransaction(baseDto()),
            ).rejects.toThrow('Serial number ID is required')
        })

        it('should accept RECEIPT with serialNumberId', async () => {
            mockPrisma.mmMaterial.findFirst.mockResolvedValue(
                activeMaterial({ serialManaged: true }),
            )

            const result = await service.postTransaction(
                baseDto({ serialNumberId: 'serial-1' }),
            )
            expect(result).toBeDefined()
        })
    })

    describe('Material usability', () => {
        it('should reject INACTIVE material', async () => {
            mockPrisma.mmMaterial.findFirst.mockResolvedValue(
                activeMaterial({ status: 'INACTIVE' }),
            )
            await expect(service.postTransaction(baseDto())).rejects.toThrow(BadRequestException)
        })

        it('should reject DRAFT material', async () => {
            mockPrisma.mmMaterial.findFirst.mockResolvedValue(
                activeMaterial({ status: 'DRAFT' }),
            )
            await expect(service.postTransaction(baseDto())).rejects.toThrow(BadRequestException)
        })
    })

    describe('UOM conversion on post', () => {
        it('should normalize quantity to base UOM via conversion engine', async () => {
            uomConversions.toBaseUom.mockResolvedValue({
                quantity: new Decimal(12),
                baseUomId: 'uom-base',
            })

            await service.postTransaction(baseDto({ quantity: 1, uomId: 'uom-box' }))

            expect(uomConversions.toBaseUom).toHaveBeenCalledWith('mat-1', 'uom-box', 1)
        })
    })

    describe('Blocked stock', () => {
        it('should post to BLOCKED stock status', async () => {
            const result = await service.postTransaction(
                baseDto({ stockStatus: 'BLOCKED' }),
            )
            expect(result.stockStatus).toBe('BLOCKED')
        })
    })

    describe('Quality inspection stock', () => {
        it('should post to QUALITY_INSPECTION stock status', async () => {
            const result = await service.postTransaction(
                baseDto({ stockStatus: 'QUALITY_INSPECTION' }),
            )
            expect(result.stockStatus).toBe('QUALITY_INSPECTION')
        })
    })

    describe('Reversal', () => {
        const originalTxn = {
            id: 'txn-orig',
            transactionNumber: 'TXN-20260115-00001',
            companyId: 'co-1',
            warehouseId: 'wh-1',
            storageBinId: null,
            materialId: 'mat-1',
            batchId: null,
            serialNumberId: null,
            stockStatus: 'UNRESTRICTED',
            movementType: 'RECEIPT',
            quantity: new Decimal(100),
            uomId: 'uom-1',
            unitCost: new Decimal(10),
            totalCost: new Decimal(1000),
            postingDate: new Date(),
            documentDate: new Date(),
            sourceModule: null,
            sourceDocumentType: null,
            sourceDocumentId: null,
            sourceDocumentLineId: null,
            plantId: null,
            baseQuantity: new Decimal(100),
            signedQuantity: new Decimal(100),
        }

        it('should create a reversal transaction', async () => {
            mockPrisma.mmInventoryTransaction.findUnique.mockImplementation(
                ({ where }: any) => {
                    if (where?.idempotencyKey) return Promise.resolve(null)
                    if (where?.id === 'txn-orig') return Promise.resolve(originalTxn)
                    if (where?.reversalOfId === 'txn-orig') return Promise.resolve(null)
                    return Promise.resolve(null)
                },
            )

            mockPrisma.mmInventoryBalance.findFirst.mockResolvedValue({
                quantity: new Decimal(100),
                reservedQuantity: new Decimal(0),
                availableQuantity: new Decimal(100),
            })

            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                const txClient = {
                    mmInventoryTransaction: {
                        create: jest.fn().mockImplementation(({ data }) =>
                            mockTxn({ ...data, reversalOfId: originalTxn.id }),
                        ),
                        findFirst: jest.fn().mockResolvedValue(null),
                        findUnique: jest.fn().mockImplementation(({ where }) => {
                            if (where?.idempotencyKey) return Promise.resolve(null)
                            if (where?.reversalOfId) return Promise.resolve(null)
                            return Promise.resolve(null)
                        }),
                    },
                    mmInventoryBalance: {
                        findFirst: jest.fn().mockResolvedValue({
                            id: 'bal-1',
                            quantity: new Decimal(100),
                            reservedQuantity: new Decimal(0),
                            availableQuantity: new Decimal(100),
                            version: 1,
                        }),
                        update: jest.fn().mockResolvedValue({}),
                        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                    },
                    mmInventoryAudit: { create: jest.fn() },
                }
                return fn(txClient)
            })

            const result = await service.reverseTransaction('txn-orig', {
                reasonCode: 'ERROR',
                remarks: 'Wrong qty',
            })

            expect(result).toBeDefined()
            expect(result.reversalOfId).toBe('txn-orig')
            expect(events.emit).toHaveBeenCalledWith(
                'inventory.transaction.reversed',
                expect.objectContaining({
                    original: originalTxn,
                }),
            )
        })
    })

    describe('Double reversal idempotent', () => {
        it('should return existing reversal when transaction already reversed', async () => {
            const existingReversal = { id: 'txn-rev', reversalOfId: 'txn-orig' }
            mockPrisma.mmInventoryTransaction.findUnique.mockImplementation(
                ({ where }: any) => {
                    if (where?.idempotencyKey) return Promise.resolve(null)
                    if (where?.reversalOfId === 'txn-orig') {
                        return Promise.resolve(existingReversal)
                    }
                    if (where?.id === 'txn-orig') {
                        return Promise.resolve({
                            id: 'txn-orig',
                            movementType: 'RECEIPT',
                            baseQuantity: 10,
                            quantity: 10,
                            totalCost: 0,
                            companyId: 'co-1',
                            warehouseId: 'wh-1',
                            materialId: 'mat-1',
                            stockStatus: 'UNRESTRICTED',
                            uomId: 'uom-1',
                            documentDate: new Date(),
                        })
                    }
                    return Promise.resolve(null)
                },
            )

            const result = await service.reverseTransaction('txn-orig', {})
            expect(result).toBe(existingReversal)
            expect(mockPrisma.$transaction).not.toHaveBeenCalled()
        })
    })

    describe('Concurrent posting', () => {
        it('should handle two simultaneous receipts (both succeed independently)', async () => {
            let callCount = 0
            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                callCount++
                const seq = callCount
                const txClient = {
                    mmInventoryTransaction: (() => {
                        const created = { current: null as any }
                        return {
                            create: jest.fn().mockImplementation(({ data }) => {
                                created.current = mockTxn(data)
                                return created.current
                            }),
                            findFirst: jest.fn().mockResolvedValue(null),
                            findUnique: jest.fn().mockImplementation(() => created.current),
                        }
                    })(),
                    mmInventoryBalance: {
                        findFirst: jest.fn().mockResolvedValue(
                            seq === 1
                                ? null
                                : {
                                      id: 'bal-1',
                                      quantity: new Decimal(50),
                                      reservedQuantity: new Decimal(0),
                                      availableQuantity: new Decimal(50),
                                      version: 1,
                                  },
                        ),
                        create: jest.fn().mockImplementation(({ data }) => ({ id: 'bal-new', ...data })),
                        update: jest.fn().mockResolvedValue({}),
                        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                    },
                    mmInventoryAudit: { create: jest.fn() },
                }
                return fn(txClient)
            })

            const [r1, r2] = await Promise.all([
                service.postTransaction(baseDto({ quantity: 50 })),
                service.postTransaction(baseDto({ quantity: 75 })),
            ])

            expect(r1).toBeDefined()
            expect(r2).toBeDefined()
            expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2)
        })
    })

    describe('Idempotency', () => {
        it('should return existing transaction for duplicate idempotencyKey', async () => {
            const existingTxn = {
                id: 'txn-existing',
                transactionNumber: 'TXN-20260115-00001',
                idempotencyKey: 'idem-123',
            }
            mockPrisma.mmInventoryTransaction.findUnique.mockImplementation(
                ({ where }: any) => {
                    if (where?.idempotencyKey === 'idem-123') {
                        return Promise.resolve(existingTxn)
                    }
                    return Promise.resolve(null)
                },
            )

            const result = await service.postTransaction(
                baseDto({ idempotencyKey: 'idem-123' }),
            )

            expect(result).toBe(existingTxn)
            expect(mockPrisma.$transaction).not.toHaveBeenCalled()
        })

        it('should re-check idempotencyKey inside the transaction', async () => {
            const existingInside = {
                id: 'txn-race',
                transactionNumber: 'TXN-20260115-00099',
                idempotencyKey: 'idem-race',
            }
            mockPrisma.mmInventoryTransaction.findUnique.mockImplementation(
                ({ where }: any) => {
                    if (where?.idempotencyKey === 'idem-race') {
                        return Promise.resolve(null)
                    }
                    return Promise.resolve(null)
                },
            )

            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                const txClient = {
                    mmInventoryTransaction: {
                        create: jest.fn(),
                        findFirst: jest.fn().mockResolvedValue(null),
                        findUnique: jest.fn().mockResolvedValue(existingInside),
                    },
                    mmInventoryBalance: {
                        findFirst: jest.fn(),
                        create: jest.fn(),
                        updateMany: jest.fn(),
                    },
                    mmInventoryAudit: { create: jest.fn() },
                }
                return fn(txClient)
            })

            const result = await service.postTransaction(
                baseDto({ idempotencyKey: 'idem-race' }),
            )
            expect(result).toBe(existingInside)
        })
    })

    describe('MM-05 ledger fields and hardening', () => {
        it('should persist baseQuantity, signedQuantity and default plantId from warehouse', async () => {
            let createdData: any
            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                const created = { current: null as any }
                const txClient = {
                    mmInventoryTransaction: {
                        create: jest.fn().mockImplementation(({ data }) => {
                            createdData = data
                            created.current = mockTxn(data)
                            return created.current
                        }),
                        findFirst: jest.fn().mockResolvedValue(null),
                        findUnique: jest.fn().mockImplementation(() => created.current),
                    },
                    mmInventoryBalance: {
                        findFirst: jest.fn().mockResolvedValue(null),
                        create: jest.fn().mockImplementation(({ data }) => ({ id: 'bal-new', ...data })),
                        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                    },
                    mmInventoryAudit: { create: jest.fn() },
                }
                return fn(txClient)
            })

            await service.postTransaction(baseDto({ quantity: 40 }))
            expect(createdData.baseQuantity.toString()).toBe('40')
            expect(createdData.signedQuantity.toString()).toBe('40')
            expect(createdData.plantId).toBe('plant-1')
            expect(createdData.createdBy).toBe('system')
        })

        it('should store negative signedQuantity for ISSUE', async () => {
            let createdData: any
            mockPrisma.mmInventoryBalance.findFirst.mockResolvedValue({
                id: 'bal-1',
                quantity: new Decimal(100),
                reservedQuantity: new Decimal(0),
                availableQuantity: new Decimal(100),
                version: 1,
            })
            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                const created = { current: null as any }
                const txClient = {
                    mmInventoryTransaction: {
                        create: jest.fn().mockImplementation(({ data }) => {
                            createdData = data
                            created.current = mockTxn(data)
                            return created.current
                        }),
                        findFirst: jest.fn().mockResolvedValue(null),
                        findUnique: jest.fn().mockImplementation(() => created.current),
                    },
                    mmInventoryBalance: {
                        findFirst: jest.fn().mockResolvedValue({
                            id: 'bal-1',
                            quantity: new Decimal(100),
                            reservedQuantity: new Decimal(0),
                            availableQuantity: new Decimal(100),
                            version: 1,
                        }),
                        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                    },
                    mmInventoryAudit: { create: jest.fn() },
                }
                return fn(txClient)
            })

            await service.postTransaction(baseDto({ movementType: 'ISSUE', quantity: 15 }))
            expect(createdData.signedQuantity.toString()).toBe('-15')
            expect(createdData.baseQuantity.toString()).toBe('15')
        })

        it('ledger reconstruction: Σ signedQuantity equals balance quantity', async () => {
            const signedLedger: Decimal[] = []
            let balanceQty = new Decimal(0)

            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                const created = { current: null as any }
                const txClient = {
                    mmInventoryTransaction: {
                        create: jest.fn().mockImplementation(({ data }) => {
                            signedLedger.push(new Decimal(data.signedQuantity))
                            created.current = mockTxn(data)
                            return created.current
                        }),
                        findFirst: jest.fn().mockResolvedValue(null),
                        findUnique: jest.fn().mockImplementation(() => created.current),
                    },
                    mmInventoryBalance: {
                        findFirst: jest.fn().mockImplementation(async () => {
                            if (balanceQty.eq(0) && signedLedger.length === 0) return null
                            return {
                                id: 'bal-1',
                                quantity: balanceQty,
                                reservedQuantity: new Decimal(0),
                                availableQuantity: balanceQty,
                                version: signedLedger.length,
                            }
                        }),
                        create: jest.fn().mockImplementation(({ data }) => {
                            balanceQty = new Decimal(data.quantity)
                            return { id: 'bal-new', ...data }
                        }),
                        updateMany: jest.fn().mockImplementation(({ data }) => {
                            balanceQty = new Decimal(data.quantity)
                            return { count: 1 }
                        }),
                    },
                    mmInventoryAudit: { create: jest.fn() },
                }
                return fn(txClient)
            })

            mockPrisma.mmInventoryBalance.findFirst.mockResolvedValue({
                quantity: new Decimal(100),
                reservedQuantity: new Decimal(0),
                availableQuantity: new Decimal(100),
            })

            await service.postTransaction(baseDto({ quantity: 100 }))
            await service.postTransaction(baseDto({ movementType: 'ISSUE', quantity: 30 }))
            await service.postTransaction(baseDto({ movementType: 'ADJUSTMENT_IN', quantity: 5 }))

            const sumSigned = signedLedger.reduce((a, b) => a.plus(b), new Decimal(0))
            expect(sumSigned.toString()).toBe(balanceQty.toString())
            expect(sumSigned.toString()).toBe('75')
        })

        it('should post ADJUSTMENT_IN and ADJUSTMENT_OUT', async () => {
            mockPrisma.mmInventoryBalance.findFirst.mockResolvedValue({
                id: 'bal-1',
                quantity: new Decimal(50),
                reservedQuantity: new Decimal(0),
                availableQuantity: new Decimal(50),
                version: 1,
            })
            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                const created = { current: null as any }
                const txClient = {
                    mmInventoryTransaction: {
                        create: jest.fn().mockImplementation(({ data }) => {
                            created.current = mockTxn(data)
                            return created.current
                        }),
                        findFirst: jest.fn().mockResolvedValue(null),
                        findUnique: jest.fn().mockImplementation(() => created.current),
                    },
                    mmInventoryBalance: {
                        findFirst: jest.fn().mockResolvedValue({
                            id: 'bal-1',
                            quantity: new Decimal(50),
                            reservedQuantity: new Decimal(0),
                            availableQuantity: new Decimal(50),
                            version: 1,
                        }),
                        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                        create: jest.fn(),
                    },
                    mmInventoryAudit: { create: jest.fn() },
                }
                return fn(txClient)
            })

            const adjIn = await service.postTransaction(
                baseDto({ movementType: 'ADJUSTMENT_IN', quantity: 10 }),
            )
            expect(adjIn.movementType).toBe('ADJUSTMENT_IN')

            const adjOut = await service.postTransaction(
                baseDto({ movementType: 'ADJUSTMENT_OUT', quantity: 3 }),
            )
            expect(adjOut.movementType).toBe('ADJUSTMENT_OUT')
        })

        it('should reject unknown stock status and accept IN_TRANSIT', async () => {
            await expect(
                service.postTransaction(baseDto({ stockStatus: 'BOGUS' })),
            ).rejects.toThrow(BadRequestException)

            const ok = await service.postTransaction(
                baseDto({ stockStatus: 'IN_TRANSIT' }),
            )
            expect(ok.stockStatus).toBe('IN_TRANSIT')
        })

        it('should throw ConflictException on optimistic version mismatch', async () => {
            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                const created = { current: null as any }
                const txClient = {
                    mmInventoryTransaction: {
                        create: jest.fn().mockImplementation(({ data }) => {
                            created.current = mockTxn(data)
                            return created.current
                        }),
                        findFirst: jest.fn().mockResolvedValue(null),
                        findUnique: jest.fn().mockImplementation(() => created.current),
                    },
                    mmInventoryBalance: {
                        findFirst: jest.fn().mockResolvedValue({
                            id: 'bal-1',
                            quantity: new Decimal(10),
                            reservedQuantity: new Decimal(0),
                            availableQuantity: new Decimal(10),
                            version: 3,
                        }),
                        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
                    },
                    mmInventoryAudit: { create: jest.fn() },
                }
                return fn(txClient)
            })

            await expect(service.postTransaction(baseDto({ quantity: 5 }))).rejects.toThrow(
                ConflictException,
            )
        })

        it('transfer transit: OUT from unrestricted then IN to IN_TRANSIT', async () => {
            mockPrisma.mmInventoryBalance.findFirst.mockResolvedValue({
                id: 'bal-1',
                quantity: new Decimal(20),
                reservedQuantity: new Decimal(0),
                availableQuantity: new Decimal(20),
                version: 1,
            })
            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                const created = { current: null as any }
                const txClient = {
                    mmInventoryTransaction: {
                        create: jest.fn().mockImplementation(({ data }) => {
                            created.current = mockTxn(data)
                            return created.current
                        }),
                        findFirst: jest.fn().mockResolvedValue(null),
                        findUnique: jest.fn().mockImplementation(() => created.current),
                    },
                    mmInventoryBalance: {
                        findFirst: jest.fn().mockResolvedValue({
                            id: 'bal-1',
                            quantity: new Decimal(20),
                            reservedQuantity: new Decimal(0),
                            availableQuantity: new Decimal(20),
                            version: 1,
                        }),
                        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                        create: jest.fn().mockImplementation(({ data }) => ({ id: 'bal-new', ...data })),
                    },
                    mmInventoryAudit: { create: jest.fn() },
                }
                return fn(txClient)
            })

            const out = await service.postTransaction(
                baseDto({ movementType: 'TRANSFER_OUT', quantity: 20 }),
            )
            expect(out.movementType).toBe('TRANSFER_OUT')

            mockPrisma.mmInventoryBalance.findFirst.mockResolvedValue(null)
            const transitIn = await service.postTransaction(
                baseDto({
                    movementType: 'TRANSFER_IN',
                    quantity: 20,
                    warehouseId: 'wh-2',
                    stockStatus: 'IN_TRANSIT',
                }),
            )
            expect(transitIn.stockStatus).toBe('IN_TRANSIT')
            expect(transitIn.movementType).toBe('TRANSFER_IN')
        })
    })
})
