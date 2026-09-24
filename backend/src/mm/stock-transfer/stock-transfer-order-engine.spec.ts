/**
 * Phase 6: Stock Transfer Order engine scenarios
 */
import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { InventoryAvailabilityService } from '../inventory/inventory-availability.service'
import { ReservationEngineService } from '../inventory/reservation-allocation/reservation-engine.service'
import { AllocationEngineService } from '../inventory/reservation-allocation/allocation-engine.service'
import { PutawayService } from '../warehouse/putaway/putaway.service'
import { WarehouseTaskService } from '../warehouse/tasks/warehouse-task.service'
import { StockTransferOrderService } from './stock-transfer-order.service'
import { StockTransferValidationService } from './stock-transfer-validation.service'
import { StockTransferAllocationService } from './stock-transfer-allocation.service'
import { StockTransferShipmentService } from './stock-transfer-shipment.service'
import { StockTransferReceiptService } from './stock-transfer-receipt.service'
import { StockTransferWarehouseBridgeService } from './stock-transfer-warehouse-bridge.service'

describe('Stock Transfer Order Engine (Phase 6)', () => {
    let orders: StockTransferOrderService
    let validation: StockTransferValidationService
    let postings: Array<Record<string, unknown>>
    let store: {
        warehouses: Map<string, any>
        materials: Map<string, any>
        batches: Map<string, any>
        serials: Map<string, any>
        orders: Map<string, any>
        lines: Map<string, any>
        shipments: Map<string, any>
        shipmentLines: Map<string, any>
        receipts: Map<string, any>
        receiptLines: Map<string, any>
    }
    let seq: number
    let cancelReservation: jest.Mock
    let availableQty: number

    const includeOrder = (order: any) => ({
        ...order,
        lines: [...store.lines.values()].filter((l) => l.orderId === order.id),
        shipments: [...store.shipments.values()]
            .filter((s) => s.orderId === order.id)
            .map((s) => ({
                ...s,
                lines: [...store.shipmentLines.values()].filter((l) => l.shipmentId === s.id),
            })),
        receipts: [...store.receipts.values()]
            .filter((r) => r.orderId === order.id)
            .map((r) => ({
                ...r,
                lines: [...store.receiptLines.values()].filter((l) => l.receiptId === r.id),
            })),
        sourceWarehouse: store.warehouses.get(order.sourceWarehouseId),
        destinationWarehouse: store.warehouses.get(order.destinationWarehouseId),
    })

    beforeEach(async () => {
        seq = 0
        postings = []
        availableQty = 1000
        cancelReservation = jest.fn().mockResolvedValue({})
        store = {
            warehouses: new Map([
                [
                    'wh-1',
                    {
                        id: 'wh-1',
                        companyId: 'co-1',
                        status: 'ACTIVE',
                        deletedAt: null,
                        branchId: 'br-1',
                        plantId: 'pl-1',
                        code: 'WH1',
                        name: 'Source',
                    },
                ],
                [
                    'wh-2',
                    {
                        id: 'wh-2',
                        companyId: 'co-1',
                        status: 'ACTIVE',
                        deletedAt: null,
                        branchId: 'br-2',
                        plantId: 'pl-2',
                        code: 'WH2',
                        name: 'Dest',
                    },
                ],
            ]),
            materials: new Map([
                [
                    'mat-1',
                    {
                        id: 'mat-1',
                        materialCode: 'MAT1',
                        status: 'ACTIVE',
                        deletedAt: null,
                        batchManaged: false,
                        serialManaged: false,
                        baseUomId: 'uom-1',
                    },
                ],
                [
                    'mat-batch',
                    {
                        id: 'mat-batch',
                        materialCode: 'BATCH1',
                        status: 'ACTIVE',
                        deletedAt: null,
                        batchManaged: true,
                        serialManaged: false,
                        baseUomId: 'uom-1',
                    },
                ],
                [
                    'mat-serial',
                    {
                        id: 'mat-serial',
                        materialCode: 'SER1',
                        status: 'ACTIVE',
                        deletedAt: null,
                        batchManaged: false,
                        serialManaged: true,
                        baseUomId: 'uom-1',
                    },
                ],
            ]),
            batches: new Map([['batch-1', { id: 'batch-1', materialId: 'mat-batch' }]]),
            serials: new Map([['ser-1', { id: 'ser-1', materialId: 'mat-serial' }]]),
            orders: new Map(),
            lines: new Map(),
            shipments: new Map(),
            shipmentLines: new Map(),
            receipts: new Map(),
            receiptLines: new Map(),
        }

        const mockPrisma: any = {
            warehouse: {
                findUnique: jest.fn(({ where }: any) =>
                    Promise.resolve(store.warehouses.get(where.id) ?? null),
                ),
            },
            mmMaterial: {
                findFirst: jest.fn(({ where }: any) =>
                    Promise.resolve(store.materials.get(where.id) ?? null),
                ),
            },
            mmBatch: {
                findUnique: jest.fn(({ where }: any) =>
                    Promise.resolve(store.batches.get(where.id) ?? null),
                ),
            },
            mmSerialNumber: {
                findUnique: jest.fn(({ where }: any) =>
                    Promise.resolve(store.serials.get(where.id) ?? null),
                ),
            },
            mmStockTransferOrder: {
                findFirst: jest.fn().mockResolvedValue(null),
                findUnique: jest.fn(({ where, include }: any) => {
                    const o = store.orders.get(where.id)
                    if (!o) return Promise.resolve(null)
                    return Promise.resolve(include ? includeOrder(o) : o)
                }),
                findMany: jest.fn().mockResolvedValue([]),
                count: jest.fn().mockResolvedValue(0),
                create: jest.fn(({ data, include }: any) => {
                    const id = `sto-${++seq}`
                    const order = {
                        id,
                        orderNumber: data.orderNumber,
                        companyId: data.companyId,
                        transferType: data.transferType,
                        sourceWarehouseId: data.sourceWarehouseId,
                        destinationWarehouseId: data.destinationWarehouseId,
                        postingDate: data.postingDate ?? new Date(),
                        requestedBy: data.requestedBy ?? null,
                        approvedBy: null,
                        submittedAt: null,
                        approvedAt: null,
                        closedAt: null,
                        notes: data.notes ?? null,
                        status: data.status ?? 'DRAFT',
                        reservationHeaderId: null,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    }
                    store.orders.set(id, order)
                    for (const line of data.lines?.create ?? []) {
                        const lid = `stol-${++seq}`
                        store.lines.set(lid, {
                            id: lid,
                            orderId: id,
                            lineNumber: line.lineNumber,
                            materialId: line.materialId,
                            quantity: new Decimal(line.quantity),
                            uomId: line.uomId,
                            sourceBinId: line.sourceBinId ?? null,
                            destinationBinId: line.destinationBinId ?? null,
                            batchId: line.batchId ?? null,
                            serialNumberId: line.serialNumberId ?? null,
                            allocatedQty: new Decimal(0),
                            dispatchedQty: new Decimal(0),
                            receivedQty: new Decimal(0),
                            status: line.status ?? 'PENDING',
                        })
                    }
                    return Promise.resolve(include ? includeOrder(order) : order)
                }),
                update: jest.fn(({ where, data, include }: any) => {
                    const o = store.orders.get(where.id)
                    Object.assign(o, data)
                    return Promise.resolve(include ? includeOrder(o) : o)
                }),
                updateMany: jest.fn(({ where, data }: any) => {
                    const o = store.orders.get(where.id)
                    if (!o) return Promise.resolve({ count: 0 })
                    if (where.status?.in && !where.status.in.includes(o.status)) {
                        return Promise.resolve({ count: 0 })
                    }
                    if (typeof where.status === 'string' && o.status !== where.status) {
                        return Promise.resolve({ count: 0 })
                    }
                    Object.assign(o, data)
                    return Promise.resolve({ count: 1 })
                }),
            },
            mmStockTransferOrderLine: {
                findMany: jest.fn(({ where }: any) =>
                    Promise.resolve(
                        [...store.lines.values()].filter((l) => l.orderId === where.orderId),
                    ),
                ),
                update: jest.fn(({ where, data }: any) => {
                    const line = store.lines.get(where.id)
                    Object.assign(line, data)
                    return Promise.resolve(line)
                }),
            },
            mmTransferShipment: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(({ data, include }: any) => {
                    const id = `ship-${++seq}`
                    const shipment = {
                        id,
                        shipmentNumber: data.shipmentNumber,
                        orderId: data.orderId,
                        status: data.status,
                        dispatchedAt: data.dispatchedAt,
                        dispatchedBy: data.dispatchedBy ?? null,
                    }
                    store.shipments.set(id, shipment)
                    for (const line of data.lines?.create ?? []) {
                        const lid = `shipl-${++seq}`
                        store.shipmentLines.set(lid, {
                            id: lid,
                            shipmentId: id,
                            orderLineId: line.orderLineId,
                            quantity: line.quantity,
                        })
                    }
                    return Promise.resolve(
                        include
                            ? {
                                  ...shipment,
                                  lines: [...store.shipmentLines.values()].filter(
                                      (l) => l.shipmentId === id,
                                  ),
                              }
                            : shipment,
                    )
                }),
            },
            mmTransferReceipt: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(({ data, include }: any) => {
                    const id = `rcpt-${++seq}`
                    const receipt = {
                        id,
                        receiptNumber: data.receiptNumber,
                        orderId: data.orderId,
                        shipmentId: data.shipmentId ?? null,
                        status: data.status,
                        receivedAt: data.receivedAt,
                        receivedBy: data.receivedBy ?? null,
                    }
                    store.receipts.set(id, receipt)
                    for (const line of data.lines?.create ?? []) {
                        const lid = `rcptl-${++seq}`
                        store.receiptLines.set(lid, {
                            id: lid,
                            receiptId: id,
                            orderLineId: line.orderLineId,
                            quantity: line.quantity,
                            destinationBinId: line.destinationBinId ?? null,
                        })
                    }
                    return Promise.resolve(
                        include
                            ? {
                                  ...receipt,
                                  lines: [...store.receiptLines.values()].filter(
                                      (l) => l.receiptId === id,
                                  ),
                              }
                            : receipt,
                    )
                }),
            },
        }

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                StockTransferOrderService,
                StockTransferValidationService,
                StockTransferAllocationService,
                StockTransferShipmentService,
                StockTransferReceiptService,
                StockTransferWarehouseBridgeService,
                { provide: PrismaService, useValue: mockPrisma },
                {
                    provide: InventoryPostingService,
                    useValue: {
                        postTransaction: jest.fn(async (payload: any) => {
                            postings.push(payload)
                            return { id: `txn-${postings.length}` }
                        }),
                    },
                },
                {
                    provide: InventoryAvailabilityService,
                    useValue: {
                        assertAvailable: jest.fn(async (_c, _w, _m, qty: number) => ({
                            ok: qty <= availableQty,
                            available: availableQty,
                        })),
                    },
                },
                {
                    provide: ReservationEngineService,
                    useValue: {
                        create: jest.fn(async () => ({ id: `rsv-${++seq}` })),
                        cancel: cancelReservation,
                    },
                },
                {
                    provide: AllocationEngineService,
                    useValue: {
                        allocateHeader: jest.fn(async () => ({ id: `alloc-${++seq}` })),
                    },
                },
                {
                    provide: PutawayService,
                    useValue: { createFromEvent: jest.fn().mockResolvedValue({ id: 'pa-1' }) },
                },
                {
                    provide: WarehouseTaskService,
                    useValue: {
                        create: jest.fn().mockResolvedValue({ id: 'wt-1' }),
                    },
                },
            ],
        }).compile()

        orders = module.get(StockTransferOrderService)
        validation = module.get(StockTransferValidationService)
    })

    async function seedWhToWh(qty = 100) {
        const order = await orders.create({
            companyId: 'co-1',
            transferType: 'WAREHOUSE_TO_WAREHOUSE',
            sourceWarehouseId: 'wh-1',
            destinationWarehouseId: 'wh-2',
            lines: [{ materialId: 'mat-1', quantity: qty, uomId: 'uom-1' }],
        })
        await orders.approve(order.id)
        await orders.allocate(order.id)
        return orders.findOne(order.id)
    }

    it('1) bin-to-bin happy path (no IN_TRANSIT)', async () => {
        const order = await orders.create({
            companyId: 'co-1',
            transferType: 'BIN_TO_BIN',
            sourceWarehouseId: 'wh-1',
            destinationWarehouseId: 'wh-1',
            lines: [
                {
                    materialId: 'mat-1',
                    quantity: 10,
                    uomId: 'uom-1',
                    sourceBinId: 'bin-a',
                    destinationBinId: 'bin-b',
                },
            ],
        })
        await orders.approve(order.id)
        await orders.allocate(order.id)
        const closed = await orders.dispatch(order.id)
        expect(closed.status).toBe('CLOSED')
        expect(postings.every((p) => p.stockStatus === 'UNRESTRICTED')).toBe(true)
        expect(postings.some((p) => p.stockStatus === 'IN_TRANSIT')).toBe(false)
    })

    it('2) warehouse-to-warehouse full flow', async () => {
        const allocated = await seedWhToWh(50)
        expect(allocated.status).toBe('ALLOCATED')
        const dispatched = await orders.dispatch(allocated.id)
        expect(['DISPATCHED', 'IN_TRANSIT']).toContain(dispatched.status)
        const line = dispatched.lines[0]
        const received = await orders.receive(dispatched.id, {
            lines: [{ orderLineId: line.id, quantity: Number(line.quantity) }],
        })
        expect(received.status).toBe('CLOSED')
    })

    it('3) partial dispatch', async () => {
        const allocated = await seedWhToWh(100)
        const lineId = allocated.lines[0].id
        const partial = await orders.dispatch(allocated.id, {
            lines: [{ orderLineId: lineId, quantity: 40 }],
        })
        expect(Number(partial.lines[0].dispatchedQty)).toBe(40)
        expect(partial.status).toBe('DISPATCHED')
    })

    it('4) partial receipt', async () => {
        const allocated = await seedWhToWh(100)
        const dispatched = await orders.dispatch(allocated.id)
        const lineId = dispatched.lines[0].id
        const partial = await orders.receive(dispatched.id, {
            lines: [{ orderLineId: lineId, quantity: 30 }],
        })
        expect(Number(partial.lines[0].receivedQty)).toBe(30)
        expect(partial.status).toBe('PARTIALLY_RECEIVED')
    })

    it('5) full receipt → CLOSED', async () => {
        const allocated = await seedWhToWh(25)
        const dispatched = await orders.dispatch(allocated.id)
        const closed = await orders.receive(dispatched.id, {
            lines: [
                {
                    orderLineId: dispatched.lines[0].id,
                    quantity: Number(dispatched.lines[0].quantity),
                },
            ],
        })
        expect(closed.status).toBe('CLOSED')
        expect(closed.closedAt).toBeTruthy()
    })

    it('6) IN_TRANSIT balance after dispatch (posting shape)', async () => {
        const allocated = await seedWhToWh(12)
        postings.length = 0
        await orders.dispatch(allocated.id)
        expect(postings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    movementType: 'TRANSFER_OUT',
                    warehouseId: 'wh-1',
                    stockStatus: 'UNRESTRICTED',
                    sourceDocumentType: 'STOCK_TRANSFER_SHIPMENT',
                }),
                expect.objectContaining({
                    movementType: 'TRANSFER_IN',
                    warehouseId: 'wh-2',
                    stockStatus: 'IN_TRANSIT',
                    sourceDocumentType: 'STOCK_TRANSFER_SHIPMENT',
                }),
            ]),
        )
    })

    it('7) wrong destination warehouse rejected', () => {
        expect(() =>
            validation.assertDestinationWarehouse('wh-2', 'wh-wrong'),
        ).toThrow(BadRequestException)
    })

    it('8) batch-controlled transfer validation', async () => {
        await expect(
            orders.create({
                companyId: 'co-1',
                transferType: 'WAREHOUSE_TO_WAREHOUSE',
                sourceWarehouseId: 'wh-1',
                destinationWarehouseId: 'wh-2',
                lines: [{ materialId: 'mat-batch', quantity: 1, uomId: 'uom-1' }],
            }),
        ).rejects.toThrow(/Batch required/)

        const ok = await orders.create({
            companyId: 'co-1',
            transferType: 'WAREHOUSE_TO_WAREHOUSE',
            sourceWarehouseId: 'wh-1',
            destinationWarehouseId: 'wh-2',
            lines: [
                {
                    materialId: 'mat-batch',
                    quantity: 1,
                    uomId: 'uom-1',
                    batchId: 'batch-1',
                },
            ],
        })
        expect(ok.lines[0].batchId).toBe('batch-1')
    })

    it('9) serial-controlled transfer validation', async () => {
        await expect(
            orders.create({
                companyId: 'co-1',
                transferType: 'WAREHOUSE_TO_WAREHOUSE',
                sourceWarehouseId: 'wh-1',
                destinationWarehouseId: 'wh-2',
                lines: [{ materialId: 'mat-serial', quantity: 1, uomId: 'uom-1' }],
            }),
        ).rejects.toThrow(/Serial required/)

        const ok = await orders.create({
            companyId: 'co-1',
            transferType: 'WAREHOUSE_TO_WAREHOUSE',
            sourceWarehouseId: 'wh-1',
            destinationWarehouseId: 'wh-2',
            lines: [
                {
                    materialId: 'mat-serial',
                    quantity: 1,
                    uomId: 'uom-1',
                    serialNumberId: 'ser-1',
                },
            ],
        })
        expect(ok.lines[0].serialNumberId).toBe('ser-1')
    })

    it('10) cancellation releases reservation', async () => {
        const allocated = await seedWhToWh(10)
        const cancelled = await orders.cancel(allocated.id)
        expect(cancelled.status).toBe('CANCELLED')
        expect(cancelReservation).toHaveBeenCalled()
    })

    it('11) duplicate dispatch blocked', async () => {
        const allocated = await seedWhToWh(10)
        await orders.dispatch(allocated.id)
        await expect(orders.dispatch(allocated.id)).rejects.toThrow(
            /Duplicate dispatch|Cannot dispatch/,
        )
    })

    it('12) duplicate receipt blocked', async () => {
        const allocated = await seedWhToWh(10)
        const dispatched = await orders.dispatch(allocated.id)
        const payload = {
            lines: [
                {
                    orderLineId: dispatched.lines[0].id,
                    quantity: Number(dispatched.lines[0].quantity),
                },
            ],
        }
        await orders.receive(dispatched.id, payload)
        await expect(orders.receive(dispatched.id, payload)).rejects.toThrow(
            /Duplicate receipt|Cannot receive/,
        )
    })
})
