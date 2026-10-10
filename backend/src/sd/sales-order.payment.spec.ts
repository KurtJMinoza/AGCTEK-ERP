import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { Decimal } from '@prisma/client/runtime/library'
import type { PrismaService } from '../prisma/prisma.service'
import { CreateMarketplaceCheckoutDto } from './dto/sales-order.dto'
import { SalesOrderService } from './sales-order.service'

function checkoutDto(
    overrides: Partial<CreateMarketplaceCheckoutDto> = {},
): CreateMarketplaceCheckoutDto {
    return {
        checkoutId: 'checkout-1',
        customerId: 'client-1',
        customerName: 'Shopper',
        cartItems: [
            {
                divisionId: 'DIV_RETAIL',
                sku: 'SKU-1',
                description: 'Item',
                quantity: 2,
                unitPrice: 100,
                lineTotal: 200,
            },
        ],
        subtotal: 200,
        discountAmount: 0,
        shippingAmount: 50,
        totalAmount: 250,
        shippingAddress: {
            fullName: 'Shopper',
            phone: '09170000000',
            addressLine1: '1 Main St',
            city: 'Davao City',
            region: 'Davao del Sur',
            postalCode: '8000',
            country: 'PH',
        },
        paymentMethod: 'COD',
        ...overrides,
    }
}

function setup() {
    const salesOrders: Record<string, unknown> = {}
    const payments: unknown[] = []
    const mmPipeline = {
        enrichOrderForMmIntegration: jest.fn().mockResolvedValue({
            id: 'so-1',
            companyId: 'company-1',
            warehouseId: 'wh-1',
            customerId: 'client-1',
            totalAmount: new Decimal(200),
            lines: [{ materialId: 'm-1', baseQuantity: new Decimal(2) }],
        }),
        isMmLinked: jest.fn().mockReturnValue(true),
        emitSalesOrderConfirmedIntegration: jest.fn().mockResolvedValue(true),
        integrateConfirmedOrder: jest
            .fn()
            .mockResolvedValue({ integrated: false }),
        resolveCheckoutCompanyId: jest.fn().mockResolvedValue('company-1'),
    }
    const prisma = {
        sdSalesOrder: {
            findUnique: jest.fn((args: { where: Record<string, string> }) => {
                const id = args.where.id ?? args.where.idempotencyKey
                return Promise.resolve(salesOrders[id as string] ?? null)
            }),
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn((args: { data: Record<string, unknown> }) => {
                const nestedLines = (
                    args.data.lines as {
                        create: Array<Record<string, unknown>>
                    }
                ).create
                const order = {
                    id: 'so-1',
                    ...(args.data as Record<string, unknown>),
                    lines: nestedLines.map((line, idx) => ({
                        id: `line-${idx + 1}`,
                        lineNumber: idx + 1,
                        sku: line.sku,
                        divisionId: line.divisionId ?? null,
                        unitPrice: line.unitPrice,
                        lineTotal: line.lineTotal,
                        quantity: line.quantity,
                    })),
                }
                salesOrders[order.id as string] = order
                return Promise.resolve(order)
            }),
            update: jest.fn((args: { where: { id: string }; data: unknown }) =>
                Promise.resolve({
                    id: args.where.id,
                    ...(args.data as Record<string, unknown>),
                    payments: [],
                }),
            ),
        },
        sdSalesOrderPayment: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn((args: { data: Record<string, unknown> }) => {
                const record = { id: 'pay-1', ...args.data }
                payments.push(record)
                return Promise.resolve(record)
            }),
            update: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve({
                    id: 'pay-1',
                    ...(args.data as Record<string, unknown>),
                }),
            ),
        },
        sdProduct: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        sdProductVariant: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    }
    const retailClients = {
        getProfile: jest.fn().mockResolvedValue({ email: 'shopper@test.ph' }),
    }
    const products = {
        activePriceMap: jest
            .fn()
            .mockResolvedValue(new Map([['SKU-1', new Decimal('100.00')]])),
    }
    const service = new SalesOrderService(
        prisma as unknown as PrismaService,
        {} as never,
        retailClients as never,
        products as never,
        mmPipeline as never,
        {} as never,
    )
    return { prisma, mmPipeline, payments, service }
}

describe('SalesOrderService demo checkout payments', () => {
    it('rejects a checkout without a payment method', async () => {
        const dto = plainToInstance(
            CreateMarketplaceCheckoutDto,
            checkoutDto() as Partial<CreateMarketplaceCheckoutDto>,
        )
        delete (dto as Partial<CreateMarketplaceCheckoutDto>).paymentMethod
        const errors = await validate(dto)
        expect(errors.some((e) => e.property === 'paymentMethod')).toBe(true)
    })

    it('Cash on Delivery: records Pending Collection and proceeds to fulfillment', async () => {
        const { prisma, mmPipeline, service } = setup()
        const result = await service.createMarketplaceCheckout(
            checkoutDto({ paymentMethod: 'COD' }),
            'client-1',
        )
        expect(result.orderNumber).toBeTruthy()
        expect(prisma.sdSalesOrderPayment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    companyId: 'company-1',
                    salesOrderId: 'so-1',
                    customerId: 'client-1',
                    paymentMethod: 'COD',
                    status: 'Pending Collection',
                    isDemo: true,
                }),
            }),
        )
        expect(mmPipeline.emitSalesOrderConfirmedIntegration).toHaveBeenCalled()
    })

    it('stores the payment on the sales order for display', async () => {
        const { prisma, service } = setup()
        await service.createMarketplaceCheckout(
            checkoutDto({ paymentMethod: 'COD' }),
            'client-1',
        )
        const data = prisma.sdSalesOrder.create.mock.calls[0][0].data as Record<
            string,
            unknown
        >
        expect(data).toMatchObject({
            paymentMethod: 'COD',
            paymentStatus: 'Pending Collection',
            isDemoPayment: true,
        })
        expect(data.paymentReference).toContain('DEMO-')
    })

    it('demo card success: records Paid and proceeds to fulfillment', async () => {
        const { prisma, mmPipeline, service } = setup()
        await service.createMarketplaceCheckout(
            checkoutDto({
                paymentMethod: 'CARD_DEMO',
                paymentProvider: 'DemoCard',
                cardDemoSimulateFailure: false,
            }),
            'client-1',
        )
        expect(prisma.sdSalesOrderPayment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    paymentMethod: 'CARD_DEMO',
                    paymentProvider: 'DemoCard',
                    status: 'Paid',
                    paidAt: expect.any(Date),
                }),
            }),
        )
        expect(mmPipeline.emitSalesOrderConfirmedIntegration).toHaveBeenCalled()
    })

    it('demo card failure: records Failed and does NOT trigger picking', async () => {
        const { prisma, mmPipeline, service } = setup()
        const result = await service.createMarketplaceCheckout(
            checkoutDto({
                paymentMethod: 'CARD_DEMO',
                cardDemoSimulateFailure: true,
            }),
            'client-1',
        )
        expect(result.order.paymentStatus).toBe('Failed')
        expect(prisma.sdSalesOrderPayment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'Failed',
                    paidAt: null,
                }),
            }),
        )
        expect(
            mmPipeline.emitSalesOrderConfirmedIntegration,
        ).not.toHaveBeenCalled()
    })

    it('bank transfer demo: stays Pending Verification and does NOT trigger picking', async () => {
        const { prisma, mmPipeline, service } = setup()
        await service.createMarketplaceCheckout(
            checkoutDto({ paymentMethod: 'BANK_TRANSFER_DEMO' }),
            'client-1',
        )
        expect(prisma.sdSalesOrderPayment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'Pending Verification',
                    paidAt: null,
                }),
            }),
        )
        expect(
            mmPipeline.emitSalesOrderConfirmedIntegration,
        ).not.toHaveBeenCalled()
    })

    it('wallet and QR demos: confirm Paid and proceed to fulfillment', async () => {
        for (const method of ['WALLET_DEMO', 'QR_DEMO'] as const) {
            const { mmPipeline, service } = setup()
            await service.createMarketplaceCheckout(
                checkoutDto({ paymentMethod: method }),
                'client-1',
            )
            expect(
                mmPipeline.emitSalesOrderConfirmedIntegration,
            ).toHaveBeenCalled()
        }
    })

    it('stores product name and image snapshots on the order lines', async () => {
        const { prisma, service } = setup()
        prisma.sdProduct.findMany.mockResolvedValue([
            {
                divisionId: 'DIV_RETAIL',
                sku: 'SKU-1',
                name: 'Catalog Product',
                imageUrl: '/uploads/products/1.png',
            },
        ])
        await service.createMarketplaceCheckout(
            checkoutDto({ paymentMethod: 'COD' }),
            'client-1',
        )
        const data = prisma.sdSalesOrder.create.mock.calls[0][0].data as {
            lines: { create: Array<Record<string, unknown>> }
        }
        expect(data.lines.create[0]).toMatchObject({
            productNameSnapshot: 'Catalog Product',
            productImageSnapshot: '/uploads/products/1.png',
        })
    })

    it('stores variant snapshot fields when a variant is selected', async () => {
        const { prisma, service } = setup()
        prisma.sdProductVariant.findMany.mockResolvedValue([
            {
                id: 'var-1',
                variantName: '500ml Bottle',
                sku: 'SKU-1-V1',
                barcode: '4801234567890',
                imageUrl: '',
            },
        ])
        const dto = checkoutDto({ paymentMethod: 'COD' })
        dto.cartItems = [{ ...dto.cartItems[0], variantId: 'var-1' }]
        await service.createMarketplaceCheckout(dto, 'client-1')
        const data = prisma.sdSalesOrder.create.mock.calls[0][0].data as {
            lines: { create: Array<Record<string, unknown>> }
        }
        expect(data.lines.create[0]).toMatchObject({
            variantId: 'var-1',
            variantName: '500ml Bottle',
            variantSku: 'SKU-1-V1',
            variantBarcode: '4801234567890',
        })
    })

    it('numbers the next order from the max numeric suffix (no collision suffix)', async () => {
        const { prisma, service } = setup()
        prisma.sdSalesOrder.findMany.mockResolvedValue([
            { orderNumber: 'SO-000001' },
            { orderNumber: 'SO-000002' },
            { orderNumber: 'SO-000004' },
            { orderNumber: 'SO-000004-DA6F' },
        ])
        await service.createMarketplaceCheckout(
            checkoutDto({ paymentMethod: 'COD' }),
            'client-1',
        )
        const data = prisma.sdSalesOrder.create.mock.calls[0][0].data as {
            orderNumber: string
        }
        expect(data.orderNumber).toBe('SO-000005')
    })

    it('stores the resolved Organization company on the order and its lines', async () => {
        const { prisma, service } = setup()
        await service.createMarketplaceCheckout(
            checkoutDto({ paymentMethod: 'COD' }),
            'client-1',
        )
        const data = prisma.sdSalesOrder.create.mock.calls[0][0].data as Record<
            string,
            unknown
        >
        expect(data.companyId).toBe('company-1')
        const lines = (
            data.lines as {
                create: Array<Record<string, unknown>>
            }
        ).create
        expect(lines[0].companyId).toBe('company-1')
    })

    it('blocks checkout with a clear error when no company is configured', async () => {
        const { prisma, mmPipeline, service } = setup()
        mmPipeline.resolveCheckoutCompanyId.mockRejectedValue(
            new Error('Default company AGCTEK not found'),
        )
        await expect(
            service.createMarketplaceCheckout(
                checkoutDto({ paymentMethod: 'COD' }),
                'client-1',
            ),
        ).rejects.toThrow('No company is configured for this store')
        // No order may be recorded without an Organization company.
        expect(prisma.sdSalesOrder.create).not.toHaveBeenCalled()
    })

    it('admin verification of a pending payment triggers reservation + picking', async () => {
        const paymentRow = {
            id: 'pay-1',
            status: 'Pending Verification',
            paidAt: null,
        }
        const orderWithPayment = {
            id: 'so-1',
            orderNumber: 'SO-000001',
            channel: 'ECOMMERCE',
            status: 'CONFIRMED',
            companyId: 'company-1',
            warehouseId: 'wh-1',
            totalAmount: new Decimal(200),
            lines: [{ integrationStatus: 'OPEN' }],
            payments: [paymentRow],
        }
        const prismaState = {
            sdSalesOrder: {
                findUnique: jest
                    .fn()
                    .mockResolvedValueOnce(orderWithPayment)
                    .mockResolvedValueOnce({
                        ...orderWithPayment,
                        paymentStatus: 'Paid',
                    }),
                update: jest.fn().mockResolvedValue(orderWithPayment),
            },
            sdSalesOrderPayment: {
                update: jest.fn((args: { data: Record<string, unknown> }) =>
                    Promise.resolve({ id: 'pay-1', ...args.data }),
                ),
            },
            $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
        }
        const mmPipeline = {
            enrichOrderForMmIntegration: jest.fn().mockResolvedValue({
                id: 'so-1',
                companyId: 'company-1',
                warehouseId: 'wh-1',
                lines: [{ materialId: 'm-1', baseQuantity: new Decimal(2) }],
            }),
            isMmLinked: jest.fn().mockReturnValue(true),
            emitSalesOrderConfirmedIntegration: jest
                .fn()
                .mockResolvedValue(true),
        }
        const service = new SalesOrderService(
            prismaState as unknown as PrismaService,
            {} as never,
            {} as never,
            {} as never,
            mmPipeline as never,
            {} as never,
        )

        const updated = await service.updateOrderPaymentStatus('so-1', {
            status: 'Paid',
            updatedBy: 'admin-1',
        })

        expect(prismaState.sdSalesOrderPayment.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'Paid',
                    paidAt: expect.any(Date),
                }),
            }),
        )
        expect(mmPipeline.emitSalesOrderConfirmedIntegration).toHaveBeenCalled()
        expect(updated.paymentStatus).toBe('Paid')
    })

    it('does not re-emit fulfillment for an already-reserved order', async () => {
        const orderWithPayment = {
            id: 'so-1',
            orderNumber: 'SO-000001',
            channel: 'ECOMMERCE',
            status: 'CONFIRMED',
            totalAmount: new Decimal(200),
            lines: [{ integrationStatus: 'RESERVED' }],
            payments: [
                { id: 'pay-1', status: 'Pending Collection', paidAt: null },
            ],
        }
        const prismaState = {
            sdSalesOrder: {
                findUnique: jest
                    .fn()
                    .mockResolvedValueOnce(orderWithPayment)
                    .mockResolvedValueOnce({
                        ...orderWithPayment,
                        paymentStatus: 'Paid',
                        payments: [],
                    }),
                update: jest.fn().mockResolvedValue(orderWithPayment),
            },
            sdSalesOrderPayment: {
                update: jest.fn((args: { data: Record<string, unknown> }) =>
                    Promise.resolve({ id: 'pay-1', ...args.data }),
                ),
            },
            $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
        }
        const mmPipeline = {
            enrichOrderForMmIntegration: jest.fn(),
            isMmLinked: jest.fn(),
            emitSalesOrderConfirmedIntegration: jest.fn(),
        }
        const service = new SalesOrderService(
            prismaState as unknown as PrismaService,
            {} as never,
            {} as never,
            {} as never,
            mmPipeline as never,
            {} as never,
        )
        await service.updateOrderPaymentStatus('so-1', { status: 'Paid' })
        expect(
            mmPipeline.emitSalesOrderConfirmedIntegration,
        ).not.toHaveBeenCalled()
    })

    it.each([
        ['CANCELLED', 'COD', 'Cannot record payment for a cancelled order'],
        ['COMPLETED', 'COD', 'Cannot record payment for a completed order'],
        [
            'DELIVERED',
            'CARD_DEMO',
            'Only an unpaid Cash on Delivery order can be collected after delivery',
        ],
    ])(
        'does not collect payment when an order is %s',
        async (status, paymentMethod, message) => {
            const prismaState = {
                sdSalesOrder: {
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'so-1',
                        orderNumber: 'SO-000001',
                        channel: 'ECOMMERCE',
                        status,
                        lines: [{ integrationStatus: 'RESERVED' }],
                        payments: [
                            {
                                id: 'pay-1',
                                status: 'Pending Collection',
                                paymentMethod,
                                paidAt: null,
                            },
                        ],
                    }),
                },
                $transaction: jest.fn(),
            }
            const service = new SalesOrderService(
                prismaState as unknown as PrismaService,
                {} as never,
                {} as never,
                {} as never,
                {} as never,
                {} as never,
            )

            await expect(
                service.updateOrderPaymentStatus('so-1', { status: 'Paid' }),
            ).rejects.toThrow(message)
            expect(prismaState.$transaction).not.toHaveBeenCalled()
        },
    )
})
