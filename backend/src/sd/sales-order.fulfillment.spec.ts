import { BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import type { PrismaService } from '../prisma/prisma.service'
import { SalesOrderService } from './sales-order.service'
import { PickingService } from '../mm/warehouse/picking/picking.service'
import type { CreateMarketplaceCheckoutDto } from './dto/sales-order.dto'

const activeOrder = {
    id: 'so-14',
    orderNumber: 'SO-000014',
    status: 'CONFIRMED',
    channel: 'ECOMMERCE',
    paymentMethod: 'COD',
    paymentStatus: 'Pending Collection',
    companyId: 'company-1',
    warehouseId: 'warehouse-1',
    customerId: 'customer-1',
    correlationId: 'corr-14',
    idempotencyKey: 'checkout-14',
    lines: [
        {
            id: 'so-line-14',
            lineNumber: 1,
            materialId: 'material-1',
            quantity: new Decimal(10),
            baseQuantity: new Decimal(10),
        },
    ],
}

function setup(overrides: Partial<typeof activeOrder> = {}) {
    const order = { ...activeOrder, ...overrides }
    const prisma: any = {
        sdSalesOrder: {
            findUnique: jest.fn().mockImplementation((args: any) => {
                if (args.where?.idempotencyKey) return Promise.resolve(null)
                return Promise.resolve(order)
            }),
            create: jest.fn().mockImplementation((args) => {
                const createdLines = (args.data.lines?.create ?? []).map(
                    (cl: any, idx: number) => ({
                        id: `so-line-${idx + 1}`,
                        lineNumber: idx + 1,
                        materialId: 'material-1',
                        sku: cl.sku,
                        divisionId: cl.divisionId,
                        quantity: new Decimal(cl.quantity),
                        baseQuantity: new Decimal(cl.quantity),
                    }),
                )
                const created = {
                    id: 'so-new',
                    orderNumber: 'SO-000099',
                    companyId: 'company-1',
                    warehouseId: 'warehouse-1',
                    paymentStatus: 'Pending Collection',
                    channel: 'ECOMMERCE',
                    ...args.data,
                    lines: createdLines.length ? createdLines : order.lines,
                }
                Object.assign(order, created)
                return Promise.resolve(created)
            }),
            update: jest.fn().mockImplementation((args) => {
                Object.assign(order, args.data)
                return Promise.resolve(order)
            }),
            findMany: jest.fn().mockResolvedValue([]),
        },
        sdSalesOrderPayment: {
            upsert: jest
                .fn()
                .mockResolvedValue({
                    id: 'pay-1',
                    status: 'Pending Collection',
                }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        wmPickingTask: {
            findFirst: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
        },
        user: { findMany: jest.fn().mockResolvedValue([]) },
        sdProduct: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn(async (cb: any) => {
            if (typeof cb === 'function') {
                return cb(prisma)
            }
            return cb
        }),
    }
    const pipeline = {
        enrichOrderForMmIntegration: jest.fn().mockResolvedValue(order),
        isMmLinked: jest.fn().mockReturnValue(true),
        emitSalesOrderConfirmedIntegration: jest.fn().mockResolvedValue(true),
        resolveCheckoutCompanyId: jest.fn().mockResolvedValue('company-1'),
    }
    const commercialAvailability = {
        assertMarketplaceCheckoutAvailability: jest
            .fn()
            .mockResolvedValue(true),
    }
    const invoices = {
        markPaidForSalesOrder: jest.fn().mockResolvedValue(true),
    }
    const retailClients = {
        getProfile: jest
            .fn()
            .mockResolvedValue({ id: 'cust-1', email: 'test@example.com' }),
    }
    const products = {
        activePriceMap: jest
            .fn()
            .mockResolvedValue(new Map([['SKU-001', new Decimal('100.00')]])),
    }
    const service = new SalesOrderService(
        prisma as unknown as PrismaService,
        {} as never,
        retailClients as never,
        products as never,
        pipeline as never,
        {} as never,
        commercialAvailability as never,
        invoices as never,
    )
    return { prisma, pipeline, service, order }
}

describe('SalesOrder Fulfillment & Picking Suite (12 Acceptance Tests)', () => {
    // 1. Shop order creates Sales Order
    it('1. Shop order creates Sales Order', async () => {
        const { prisma, service } = setup()
        const checkoutDto: CreateMarketplaceCheckoutDto = {
            checkoutId: 'chk-001',
            customerId: 'cust-1',
            customerName: 'Test Customer',
            customerEmail: 'test@example.com',
            cartItems: [
                {
                    sku: 'SKU-001',
                    divisionId: 'DIV_RETAIL',
                    quantity: 5,
                    unitPrice: 100,
                    description: 'Test Item',
                    lineTotal: 500,
                },
            ],
            subtotal: 500,
            discountAmount: 0,
            shippingAmount: 50,
            totalAmount: 550,
            paymentMethod: 'COD',
            shippingAddress: {
                fullName: 'Test Customer',
                addressLine1: 'Street 1',
                city: 'City',
                region: 'Region',
                postalCode: '1000',
                country: 'PH',
            },
        }

        const mockTask = {
            id: 'pick-new',
            taskNumber: 'PK-000099',
            salesOrderId: 'so-new',
            salesOrderLineId: 'so-line-1',
            requiredQty: 5,
            status: 'OPEN',
        }
        prisma.wmPickingTask.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([mockTask])

        const res = await service.createMarketplaceCheckout(
            checkoutDto,
            'cust-1',
        )
        expect(res).toBeDefined()
        expect(res.salesOrderId).toBe('so-new')
        expect(prisma.sdSalesOrder.create).toHaveBeenCalled()
    })

    // 2. Cash on Delivery order creates Picking automatically
    it('2. Cash on Delivery order creates Picking automatically', async () => {
        const { prisma, pipeline, service } = setup({
            paymentMethod: 'COD',
            paymentStatus: 'Pending Collection',
        })
        const mockTask = {
            id: 'pick-cod-1',
            taskNumber: 'PK-000001',
            salesOrderId: 'so-14',
            salesOrderLineId: 'so-line-14',
            requiredQty: 10,
            pickedQty: 0,
            companyId: 'company-1',
            warehouseId: 'warehouse-1',
            status: 'OPEN',
        }
        prisma.wmPickingTask.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([mockTask])

        const result =
            await service.createReservationAndPickingForSalesOrder('so-14')
        expect(result.success).toBe(true)
        expect(result.created).toBe(true)
        expect(pipeline.emitSalesOrderConfirmedIntegration).toHaveBeenCalled()
        expect(result.pickingTasks).toEqual([mockTask])
    })

    // 3. Sales Order line quantity matches Picking line quantity
    it('3. Sales Order line quantity matches Picking line quantity', async () => {
        const { prisma, service, order } = setup()
        const soQty = Number(order.lines[0].quantity)
        const mockTask = {
            id: 'pick-1',
            taskNumber: 'PK-000001',
            salesOrderId: 'so-14',
            salesOrderLineId: 'so-line-14',
            requiredQty: soQty,
            pickedQty: 0,
            status: 'OPEN',
        }
        prisma.wmPickingTask.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([mockTask])

        const result =
            await service.createReservationAndPickingForSalesOrder('so-14')
        expect(result.pickingTasks[0].requiredQty).toBe(soQty)
    })

    // 4. Picking task has salesOrderId
    it('4. Picking task has salesOrderId', async () => {
        const { prisma, service } = setup()
        const mockTask = {
            id: 'pick-1',
            taskNumber: 'PK-000001',
            salesOrderId: 'so-14',
            salesOrderLineId: 'so-line-14',
            requiredQty: 10,
            status: 'OPEN',
        }
        prisma.wmPickingTask.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([mockTask])

        const result =
            await service.createReservationAndPickingForSalesOrder('so-14')
        expect(result.pickingTasks[0].salesOrderId).toBe('so-14')
    })

    // 5. Picking line has salesOrderLineId
    it('5. Picking line has salesOrderLineId', async () => {
        const { prisma, service } = setup()
        const mockTask = {
            id: 'pick-1',
            taskNumber: 'PK-000001',
            salesOrderId: 'so-14',
            salesOrderLineId: 'so-line-14',
            requiredQty: 10,
            status: 'OPEN',
        }
        prisma.wmPickingTask.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([mockTask])

        const result =
            await service.createReservationAndPickingForSalesOrder('so-14')
        expect(result.pickingTasks[0].salesOrderLineId).toBe('so-line-14')
    })

    // 6. Picking appears in Picking page for same company
    it('6. Picking appears in Picking page for same company', async () => {
        const mockTasks = [
            {
                id: 'pick-1',
                taskNumber: 'PK-000001',
                companyId: 'company-1',
                salesOrderId: 'so-14',
                salesOrder: {
                    id: 'so-14',
                    orderNumber: 'SO-000014',
                    companyId: 'company-1',
                    customerName: 'Customer A',
                },
            },
        ]
        const prisma = {
            wmPickingTask: {
                findMany: jest.fn().mockImplementation((args) => {
                    // Check if companyId filter is correctly queried
                    const andClauses = args.where?.AND ?? []
                    const matchesCompany = andClauses.some(
                        (clause: any) =>
                            clause.OR &&
                            clause.OR.some(
                                (c: any) => c.companyId === 'company-1',
                            ),
                    )
                    return Promise.resolve(matchesCompany ? mockTasks : [])
                }),
                count: jest.fn().mockResolvedValue(1),
            },
            user: { findMany: jest.fn().mockResolvedValue([]) },
            sdProduct: { findMany: jest.fn().mockResolvedValue([]) },
        }
        const pickingService = new PickingService(
            prisma as unknown as PrismaService,
            {} as never,
        )

        const result = await pickingService.findAll({ companyId: 'company-1' })
        expect(result.data.length).toBe(1)
        expect(result.data[0].id).toBe('pick-1')
    })

    // 7. Bank Transfer Pending Verification does not create picking
    it('7. Bank Transfer Pending Verification does not create picking', async () => {
        const { pipeline, service } = setup({
            paymentMethod: 'BANK_TRANSFER_DEMO',
            paymentStatus: 'Pending Verification',
        })

        const result =
            await service.createReservationAndPickingForSalesOrder('so-14')
        expect(result.success).toBe(false)
        expect(
            pipeline.emitSalesOrderConfirmedIntegration,
        ).not.toHaveBeenCalled()
    })

    // 8. Marking Bank Transfer as verified creates picking
    it('8. Marking Bank Transfer as verified creates picking', async () => {
        const orderData = {
            id: 'so-bt',
            orderNumber: 'SO-000088',
            status: 'CONFIRMED',
            paymentMethod: 'BANK_TRANSFER_DEMO',
            paymentStatus: 'Pending Verification',
            companyId: 'company-1',
            warehouseId: 'warehouse-1',
            payments: [
                {
                    id: 'pay-bt',
                    paymentMethod: 'BANK_TRANSFER_DEMO',
                    status: 'Pending Verification',
                    paidAt: null,
                },
            ],
            lines: [
                {
                    id: 'line-bt',
                    lineNumber: 1,
                    materialId: 'material-1',
                    quantity: new Decimal(5),
                    baseQuantity: new Decimal(5),
                },
            ],
        }
        const { prisma, pipeline, service } = setup(orderData as never)
        const mockTask = {
            id: 'pick-verified',
            taskNumber: 'PK-000088',
            salesOrderId: 'so-bt',
            salesOrderLineId: 'line-bt',
            requiredQty: 5,
            status: 'OPEN',
        }
        prisma.wmPickingTask.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([mockTask])

        await service.updateOrderPaymentStatus('so-bt', { status: 'Verified' })
        expect(pipeline.emitSalesOrderConfirmedIntegration).toHaveBeenCalled()
    })

    // 9. Failed payment does not create picking
    it('9. Failed payment does not create picking', async () => {
        const { pipeline, service } = setup({
            paymentMethod: 'CARD_DEMO',
            paymentStatus: 'Failed',
        })

        const result =
            await service.createReservationAndPickingForSalesOrder('so-14')
        expect(result.success).toBe(false)
        expect(
            pipeline.emitSalesOrderConfirmedIntegration,
        ).not.toHaveBeenCalled()
    })

    // 10. Duplicate checkout/trigger does not create duplicate picking
    it('10. Duplicate checkout/trigger does not create duplicate picking', async () => {
        const { pipeline, service, prisma } = setup()
        const existingTask = {
            id: 'pick-existing',
            taskNumber: 'PK-000014',
            salesOrderId: 'so-14',
            salesOrderLineId: 'so-line-14',
            requiredQty: 10,
            status: 'OPEN',
        }
        prisma.wmPickingTask.findMany.mockResolvedValue([existingTask])

        const result =
            await service.createReservationAndPickingForSalesOrder('so-14')
        expect(result.success).toBe(true)
        expect(result.created).toBe(false)
        expect(result.pickingTasks).toEqual([existingTask])
        expect(
            pipeline.emitSalesOrderConfirmedIntegration,
        ).not.toHaveBeenCalled()
    })

    // 11. Missing material link returns clear error, not silent failure
    it('11. Missing material link returns clear error, not silent failure', async () => {
        const { service } = setup({
            lines: [
                {
                    id: 'so-line-unlinked',
                    lineNumber: 1,
                    materialId: null as never,
                    quantity: new Decimal(10),
                    baseQuantity: new Decimal(10),
                },
            ],
        })

        await expect(
            service.createReservationAndPickingForSalesOrder('so-14'),
        ).rejects.toThrow(
            new BadRequestException(
                'Missing MM material link for sales order line 1.',
            ),
        )
    })

    // 12. Wrong companyId does not hide valid picking
    it('12. Wrong companyId does not hide valid picking', async () => {
        const matchingTask = {
            id: 'pick-12',
            taskNumber: 'PK-000012',
            companyId: null, // null on task row itself
            salesOrderId: 'so-12',
            salesOrder: {
                id: 'so-12',
                orderNumber: 'SO-000012',
                companyId: 'company-1', // attached via salesOrder
            },
            warehouse: {
                id: 'wh-1',
                companyId: 'company-1',
            },
        }
        const prisma = {
            wmPickingTask: {
                findMany: jest.fn((args) => {
                    const andClauses = args.where?.AND ?? []
                    const matches = andClauses.some((clause: any) => {
                        if (!clause.OR) return false
                        return clause.OR.some(
                            (c: any) =>
                                c.companyId === 'company-1' ||
                                c.salesOrder?.companyId === 'company-1' ||
                                c.warehouse?.companyId === 'company-1',
                        )
                    })
                    return Promise.resolve(matches ? [matchingTask] : [])
                }),
                count: jest.fn().mockResolvedValue(1),
            },
            user: { findMany: jest.fn().mockResolvedValue([]) },
            sdProduct: { findMany: jest.fn().mockResolvedValue([]) },
        }
        const pickingService = new PickingService(
            prisma as unknown as PrismaService,
            {} as never,
        )

        // Querying with company-1 finds the task even if task.companyId is null
        const result = await pickingService.findAll({ companyId: 'company-1' })
        expect(result.data.length).toBe(1)
        expect(result.data[0].id).toBe('pick-12')
    })

    it('rejects fulfillment when MM reports success without any picking task', async () => {
        const { prisma, service } = setup()
        prisma.wmPickingTask.findMany.mockResolvedValue([])

        await expect(
            service.createReservationAndPickingForSalesOrder('so-14'),
        ).rejects.toThrow('Fulfillment did not create a picking task')
    })

    it('repairs a sales-order line whose active picking quantity is incomplete', async () => {
        const { prisma, pipeline, service } = setup()
        const partial = {
            id: 'pick-partial',
            taskNumber: 'PK-000014-A',
            salesOrderId: 'so-14',
            salesOrderLineId: 'so-line-14',
            requiredQty: new Decimal(4),
            status: 'OPEN',
        }
        const completed = {
            ...partial,
            id: 'pick-completed',
            taskNumber: 'PK-000014-B',
            requiredQty: new Decimal(6),
        }
        prisma.wmPickingTask.findMany
            .mockResolvedValueOnce([partial])
            .mockResolvedValueOnce([partial, completed])

        const result =
            await service.createReservationAndPickingForSalesOrder('so-14')

        expect(result.created).toBe(true)
        expect(
            pipeline.emitSalesOrderConfirmedIntegration,
        ).toHaveBeenCalledWith(expect.anything(), {
            fulfillmentRepairKey: 'fulfillment-repair:so-14:so-line-14:10',
        })
        expect(result.pickingTasks).toHaveLength(2)
    })

    it('retries automatic package creation for an already-completed pick', async () => {
        const completedTask = {
            id: 'pick-completed',
            taskNumber: 'PK-000015',
            assignedUser: null,
            status: 'COMPLETED',
            salesOrderLine: null,
        }
        const prisma = {
            wmPickingTask: {
                findUnique: jest.fn().mockResolvedValue(completedTask),
            },
            sdProduct: { findMany: jest.fn().mockResolvedValue([]) },
        }
        const packing = {
            createFromPickingTask: jest
                .fn()
                .mockRejectedValueOnce(new Error('packing unavailable'))
                .mockResolvedValueOnce({ id: 'package-1' }),
        }
        const picking = new PickingService(
            prisma as unknown as PrismaService,
            {} as never,
            packing as never,
            {} as never,
        )
        const dto = {
            pickedQty: 1,
            scannedBinId: 'bin-1',
            scannedMaterialId: 'material-1',
        }

        await expect(
            picking.confirmPick('pick-completed', dto),
        ).rejects.toThrow('packing unavailable')
        await expect(
            picking.confirmPick('pick-completed', dto),
        ).resolves.toMatchObject({ id: 'pick-completed', status: 'COMPLETED' })
        expect(packing.createFromPickingTask).toHaveBeenCalledTimes(2)
    })
})
