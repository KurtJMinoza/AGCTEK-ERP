/**
 * Phase 1 inventory core hardening scenarios.
 * @see docs/MM_TRANSACTION_RULES.md
 */
import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { BadRequestException, ConflictException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { InventoryPostingService } from './inventory-posting.service'
import { InventoryAvailabilityService } from './inventory-availability.service'
import { PrismaService } from '../../prisma/prisma.service'
import { ValuationEngineService } from '../valuation/valuation-engine.service'
import { UomConversionsService } from '../uom-conversions/uom-conversions.service'
import { MmScopeService } from '../common/mm-scope.service'
import { MmDomainEventsService } from '../common/mm-domain-events.service'

const activeMaterial = (overrides: Record<string, unknown> = {}) => ({
    id: 'mat-1',
    companyId: 'co-1',
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

function baseDto(overrides: Record<string, unknown> = {}) {
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

describe('Inventory Core Hardening (Phase 1)', () => {
    let posting: InventoryPostingService
    let availability: InventoryAvailabilityService
    let mockPrisma: Record<string, unknown>
    let balanceStore: Map<string, Record<string, unknown>>
    let txnStore: Map<string, Record<string, unknown>>
    let txnSeq: number

    function balanceKey(d: {
        companyId: string
        warehouseId: string
        materialId: string
        stockStatus: string
        storageBinId?: string | null
    }) {
        return `${d.companyId}:${d.warehouseId}:${d.materialId}:${d.stockStatus}:${d.storageBinId ?? ''}`
    }

    beforeEach(async () => {
        txnSeq = 0
        balanceStore = new Map()
        txnStore = new Map()

        mockPrisma = {
            mmInventoryTransaction: {
                findUnique: jest.fn(({ where }: any) => {
                    if (where.idempotencyKey) {
                        return Promise.resolve(
                            [...txnStore.values()].find(
                                (t) => t.idempotencyKey === where.idempotencyKey,
                            ) ?? null,
                        )
                    }
                    if (where.reversalOfId) {
                        return Promise.resolve(
                            [...txnStore.values()].find(
                                (t) => t.reversalOfId === where.reversalOfId,
                            ) ?? null,
                        )
                    }
                    if (where.id) return Promise.resolve(txnStore.get(where.id) ?? null)
                    return Promise.resolve(null)
                }),
                findFirst: jest.fn().mockResolvedValue(null),
            },
            mmInventoryBalance: {
                findFirst: jest.fn(({ where }: any) => {
                    const key = balanceKey(where)
                    return Promise.resolve(balanceStore.get(key) ?? null)
                }),
                findMany: jest.fn(({ where }: any) => {
                    return Promise.resolve(
                        [...balanceStore.values()].filter((b) => {
                            if (where.companyId && b.companyId !== where.companyId) return false
                            if (where.warehouseId && b.warehouseId !== where.warehouseId) return false
                            if (where.materialId && b.materialId !== where.materialId) return false
                            return true
                        }),
                    )
                }),
            },
            mmMaterial: {
                findFirst: jest.fn().mockResolvedValue(activeMaterial()),
                findUnique: jest.fn().mockResolvedValue(activeMaterial()),
            },
            warehouse: { findFirst: jest.fn().mockResolvedValue(activeWarehouse) },
            wmStorageBin: { findFirst: jest.fn().mockResolvedValue(null) },
            mmUom: { findFirst: jest.fn().mockResolvedValue({ id: 'uom-1', deletedAt: null }) },
            mmBatch: { findFirst: jest.fn().mockResolvedValue(null) },
            mmSerialNumber: { findFirst: jest.fn().mockResolvedValue(null) },
            $transaction: jest.fn(),
        }

        ;(mockPrisma as any).$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
            const tx = {
                mmInventoryTransaction: {
                    findUnique: (mockPrisma.mmInventoryTransaction as any).findUnique,
                    findFirst: jest.fn().mockResolvedValue(null),
                    create: jest.fn(({ data }: any) => {
                        txnSeq++
                        const txn = {
                            id: `txn-${txnSeq}`,
                            transactionNumber: `TXN-${txnSeq}`,
                            ...data,
                        }
                        txnStore.set(txn.id, txn)
                        return txn
                    }),
                },
                mmInventoryBalance: {
                    findFirst: jest.fn(({ where }: any) => {
                        const key = balanceKey(where)
                        return Promise.resolve(balanceStore.get(key) ?? null)
                    }),
                    create: jest.fn(({ data }: any) => {
                        const key = balanceKey(data)
                        const bal = { id: `bal-${balanceStore.size + 1}`, version: 0, ...data }
                        balanceStore.set(key, bal)
                        return bal
                    }),
                    updateMany: jest.fn(({ where, data }: any) => {
                        const bal = [...balanceStore.values()].find((b) => b.id === where.id)
                        if (!bal || bal.version !== where.version) return { count: 0 }
                        const key = balanceKey(bal as any)
                        balanceStore.set(key, {
                            ...bal,
                            quantity: data.quantity ?? bal.quantity,
                            reservedQuantity: data.reservedQuantity ?? bal.reservedQuantity,
                            availableQuantity: data.availableQuantity ?? bal.availableQuantity,
                            version: (bal.version as number) + 1,
                        })
                        return { count: 1 }
                    }),
                },
                mmInventoryAudit: { create: jest.fn().mockResolvedValue({}) },
            }
            return fn(tx)
        })

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InventoryPostingService,
                InventoryAvailabilityService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: EventEmitter2, useValue: { emit: jest.fn() } },
                {
                    provide: ValuationEngineService,
                    useValue: {
                        applyInTransaction: jest.fn().mockResolvedValue({}),
                        reverseInTransaction: jest.fn().mockResolvedValue(null),
                    },
                },
                {
                    provide: UomConversionsService,
                    useValue: {
                        toBaseUom: jest.fn().mockImplementation(
                            async (_m: string, u: string, q: number) => ({
                                quantity: new Decimal(q),
                                baseUomId: u,
                            }),
                        ),
                    },
                },
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

        posting = module.get(InventoryPostingService)
        availability = module.get(InventoryAvailabilityService)
    })

    it('1–2: receive 100 → ledger + balance', async () => {
        const txn = await posting.postTransaction(baseDto({ quantity: 100 }))
        expect(txn).toBeDefined()
        expect(txn.quantity).toEqual(new Decimal(100))

        const bal = balanceStore.get('co-1:wh-1:mat-1:UNRESTRICTED:')
        expect(Number(bal?.quantity)).toBe(100)
        expect(Number(bal?.availableQuantity)).toBe(100)
    })

    it('3–4: reserve 20 → on-hand 100, available 80 (ATP math)', async () => {
        const key = 'co-1:wh-1:mat-1:UNRESTRICTED:'
        balanceStore.set(key, {
            id: 'b1',
            companyId: 'co-1',
            warehouseId: 'wh-1',
            materialId: 'mat-1',
            stockStatus: 'UNRESTRICTED',
            quantity: new Decimal(100),
            reservedQuantity: new Decimal(20),
            availableQuantity: new Decimal(80),
            version: 0,
        })

        const atp = await availability.getAvailability({
            companyId: 'co-1',
            warehouseId: 'wh-1',
            materialId: 'mat-1',
        })
        expect(atp.onHand).toBe(100)
        expect(atp.reserved).toBe(20)
        expect(atp.available).toBe(80)
    })

    it('5–6: issue 30 → on-hand 70', async () => {
        await posting.postTransaction(baseDto({ quantity: 100, idempotencyKey: 'r1' }))
        await posting.postTransaction(
            baseDto({ movementType: 'ISSUE', quantity: 30, idempotencyKey: 'i1' }),
        )
        const bal = balanceStore.get('co-1:wh-1:mat-1:UNRESTRICTED:')
        expect(Number(bal?.quantity)).toBe(70)
    })

    it('7: issue beyond available rejected', async () => {
        await posting.postTransaction(baseDto({ quantity: 10, idempotencyKey: 'r2' }))
        await expect(
            posting.postTransaction(
                baseDto({ movementType: 'ISSUE', quantity: 15, idempotencyKey: 'i2' }),
            ),
        ).rejects.toThrow(BadRequestException)
    })

    it('8: blocked stock not in unrestricted ATP', async () => {
        balanceStore.set('co-1:wh-1:mat-1:UNRESTRICTED:', {
            id: 'b1',
            companyId: 'co-1',
            warehouseId: 'wh-1',
            materialId: 'mat-1',
            stockStatus: 'UNRESTRICTED',
            quantity: new Decimal(50),
            reservedQuantity: new Decimal(0),
            availableQuantity: new Decimal(50),
            version: 0,
        })
        balanceStore.set('co-1:wh-1:mat-1:BLOCKED:', {
            id: 'b2',
            companyId: 'co-1',
            warehouseId: 'wh-1',
            materialId: 'mat-1',
            stockStatus: 'BLOCKED',
            quantity: new Decimal(30),
            reservedQuantity: new Decimal(0),
            availableQuantity: new Decimal(30),
            version: 0,
        })

        const atp = await availability.getAvailability({
            companyId: 'co-1',
            warehouseId: 'wh-1',
            materialId: 'mat-1',
        })
        expect(atp.unrestrictedOnHand).toBe(50)
        expect(atp.restricted).toBe(30)
        expect(atp.available).toBe(50)
    })

    it('9: batch-required material rejected without batch', async () => {
        ;(mockPrisma.mmMaterial as any).findFirst.mockResolvedValue(
            activeMaterial({ batchManaged: true }),
        )
        await expect(posting.postTransaction(baseDto())).rejects.toThrow(BadRequestException)
    })

    it('10: serial-required material rejected without serial', async () => {
        ;(mockPrisma.mmMaterial as any).findFirst.mockResolvedValue(
            activeMaterial({ serialManaged: true }),
        )
        await expect(posting.postTransaction(baseDto())).rejects.toThrow(BadRequestException)
    })

    it('11: duplicate idempotency key does not double-post', async () => {
        const first = await posting.postTransaction(
            baseDto({ idempotencyKey: 'dup-key', quantity: 50 }),
        )
        const second = await posting.postTransaction(
            baseDto({ idempotencyKey: 'dup-key', quantity: 50 }),
        )
        expect(second.id).toBe(first.id)
        expect(txnStore.size).toBe(1)
        const bal = balanceStore.get('co-1:wh-1:mat-1:UNRESTRICTED:')
        expect(Number(bal?.quantity)).toBe(50)
    })

    it('12: concurrent update conflict throws ConflictException', async () => {
        await posting.postTransaction(baseDto({ quantity: 100, idempotencyKey: 'base' }))
        ;(mockPrisma as any).$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
            const tx = {
                mmInventoryTransaction: {
                    findUnique: jest.fn().mockResolvedValue(null),
                    findFirst: jest.fn().mockResolvedValue(null),
                    create: jest.fn().mockResolvedValue({ id: 'txn-x' }),
                },
                mmInventoryBalance: {
                    findFirst: jest.fn().mockResolvedValue({
                        id: 'bal-1',
                        quantity: new Decimal(100),
                        reservedQuantity: new Decimal(0),
                        availableQuantity: new Decimal(100),
                        version: 0,
                        companyId: 'co-1',
                        warehouseId: 'wh-1',
                        materialId: 'mat-1',
                        stockStatus: 'UNRESTRICTED',
                    }),
                    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
                },
                mmInventoryAudit: { create: jest.fn() },
            }
            return fn(tx)
        })

        await expect(
            posting.postTransaction(
                baseDto({ movementType: 'ISSUE', quantity: 10, idempotencyKey: 'conc' }),
            ),
        ).rejects.toThrow(ConflictException)
    })

    it('atomic transfer rolls back when IN leg fails', async () => {
        await posting.postTransaction(baseDto({ quantity: 50, idempotencyKey: 'xfer-base' }))
        const beforeQty = Number(
            balanceStore.get('co-1:wh-1:mat-1:UNRESTRICTED:')?.quantity ?? 0,
        )

        ;(mockPrisma as any).$transaction.mockImplementationOnce(
            async (fn: (tx: unknown) => unknown) => {
                const balanceSnapshot = new Map(balanceStore)
                const txnSnapshot = new Map(txnStore)
                const tx = {
                    mmInventoryTransaction: {
                        findUnique: (mockPrisma.mmInventoryTransaction as any).findUnique,
                        findFirst: jest.fn().mockResolvedValue(null),
                        create: jest.fn(({ data }: any) => {
                            if (data.movementType === 'TRANSFER_IN') {
                                throw new Error('Simulated IN failure')
                            }
                            txnSeq++
                            const txn = {
                                id: `txn-${txnSeq}`,
                                transactionNumber: `TXN-${txnSeq}`,
                                ...data,
                            }
                            txnStore.set(txn.id, txn)
                            return txn
                        }),
                    },
                    mmInventoryBalance: {
                        findFirst: jest.fn(({ where }: any) => {
                            const key = balanceKey(where)
                            return Promise.resolve(balanceStore.get(key) ?? null)
                        }),
                        create: jest.fn(({ data }: any) => {
                            const key = balanceKey(data)
                            const bal = { id: `bal-${balanceStore.size + 1}`, version: 0, ...data }
                            balanceStore.set(key, bal)
                            return bal
                        }),
                        updateMany: jest.fn(({ where, data }: any) => {
                            const bal = [...balanceStore.values()].find((b) => b.id === where.id)
                            if (!bal || bal.version !== where.version) return { count: 0 }
                            const key = balanceKey(bal as any)
                            balanceStore.set(key, {
                                ...bal,
                                quantity: data.quantity ?? bal.quantity,
                                reservedQuantity: data.reservedQuantity ?? bal.reservedQuantity,
                                availableQuantity:
                                    data.availableQuantity ?? bal.availableQuantity,
                                version: (bal.version as number) + 1,
                            })
                            return { count: 1 }
                        }),
                    },
                    mmInventoryAudit: { create: jest.fn().mockResolvedValue({}) },
                }
                try {
                    return await fn(tx)
                } catch (e) {
                    balanceStore.clear()
                    balanceSnapshot.forEach((v, k) => balanceStore.set(k, v))
                    txnStore.clear()
                    txnSnapshot.forEach((v, k) => txnStore.set(k, v))
                    throw e
                }
            },
        )

        await expect(
            posting.postTransferPair(
                baseDto({
                    movementType: 'TRANSFER_OUT',
                    quantity: 10,
                    idempotencyKey: 'xfer-out-fail',
                }),
                baseDto({
                    movementType: 'TRANSFER_IN',
                    quantity: 10,
                    idempotencyKey: 'xfer-in-fail',
                }),
            ),
        ).rejects.toThrow('Simulated IN failure')

        const afterQty = Number(
            balanceStore.get('co-1:wh-1:mat-1:UNRESTRICTED:')?.quantity ?? 0,
        )
        expect(afterQty).toBe(beforeQty)
    })

    it('13–15: reverse receipt restores balance; original immutable', async () => {
        const receipt = await posting.postTransaction(
            baseDto({ quantity: 100, idempotencyKey: 'recv' }),
        )
        expect(Number(balanceStore.get('co-1:wh-1:mat-1:UNRESTRICTED:')?.quantity)).toBe(100)

        const reversal = await posting.reverseTransaction(receipt.id, {
            reasonCode: 'ERROR',
        })
        expect(reversal.reversalOfId).toBe(receipt.id)
        expect(Number(balanceStore.get('co-1:wh-1:mat-1:UNRESTRICTED:')?.quantity)).toBe(0)

        const original = txnStore.get(receipt.id)
        expect(original?.quantity).toEqual(new Decimal(100))
        expect(reversal.quantity).toEqual(new Decimal(-100))
    })
})
