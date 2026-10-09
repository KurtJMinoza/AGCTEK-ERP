import { Decimal } from '@prisma/client/runtime/library'
import type { PrismaService } from '../prisma/prisma.service'
import type {
    CreateMarketplaceCheckoutDto,
    CreateRetailSalesOrderDto,
} from './dto/sales-order.dto'
import { SalesOrderService } from './sales-order.service'

function setup() {
    const prisma = {
        sdSalesOrder: {
            findUnique: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve({
                    id: 'so-1',
                    ...args.data,
                    // Keep the created lines so marketplace checkoutResult can
                    // verify the cart it just recorded.
                    lines:
                        (args.data.lines as { create?: unknown[] } | undefined)
                            ?.create ?? [],
                }),
            ),
        },
    }
    const retailClients = {
        getProfile: jest.fn().mockResolvedValue({ email: 'shopper@test.ph' }),
    }
    const products = {
        activePriceMap: jest
            .fn()
            .mockResolvedValue(new Map([['SKU-1', new Decimal('100.00')]])),
    }
    const mmPipeline = {
        integrateConfirmedOrder: jest.fn().mockResolvedValue({ integrated: false }),
    }
    const service = new SalesOrderService(
        prisma as unknown as PrismaService,
        {} as never,
        retailClients as never,
        products as never,
        mmPipeline as never,
        {} as never,
    )
    return { prisma, service, mmPipeline }
}

const retailOrder = (
    overrides: Partial<CreateRetailSalesOrderDto>,
): CreateRetailSalesOrderDto =>
    ({
        channel: 'ECOMMERCE',
        idempotencyKey: 'retail-1',
        divisionId: 'DIV_RETAIL',
        customerId: 'client-1',
        customerName: 'Shopper',
        lines: [
            { sku: 'SKU-1', description: 'Item', quantity: 2, unitPrice: 100, lineTotal: 200 },
        ],
        subtotal: 200,
        discountAmount: 0,
        shippingAmount: 0,
        totalAmount: 200,
        ...overrides,
    }) as CreateRetailSalesOrderDto

const marketplaceCheckout = (
    overrides: Partial<CreateMarketplaceCheckoutDto>,
): CreateMarketplaceCheckoutDto =>
    ({
        checkoutId: 'co-1',
        customerId: 'client-1',
        customerName: 'Shopper',
        customerEmail: 'shopper@test.ph',
        cartItems: [
            {
                divisionId: 'DIV_RETAIL',
                sku: 'SKU-1',
                description: 'Item',
                quantity: 2,
                unitPrice: 100,
                lineTotal: 200,
            },
            {
                divisionId: 'DIV_LPG',
                sku: 'SKU-1',
                description: 'Gas',
                quantity: 1,
                unitPrice: 100,
                lineTotal: 100,
            },
        ],
        subtotal: 300,
        discountAmount: 0,
        shippingAmount: 0,
        totalAmount: 300,
        shippingAddress: {
            fullName: 'Shopper',
            phone: '09171234567',
            addressLine1: '1 Rizal St',
            city: 'Davao City',
            region: 'Davao del Sur',
            postalCode: '8000',
            country: 'PH',
        },
        ...overrides,
    }) as CreateMarketplaceCheckoutDto

describe('SalesOrderService retail order source', () => {
    it('stamps POS sales with channel POS / source POS', async () => {
        const { prisma, service } = setup()
        await service.createRetail(
            retailOrder({ channel: 'POS', branchId: 'BR_AWIC_DAVAO_MAIN', paymentReceived: 200 }),
        )
        expect(prisma.sdSalesOrder.create.mock.calls[0][0].data).toMatchObject({
            channel: 'POS',
            source: 'POS',
        })
    })

    it('stamps website orders with channel ECOMMERCE / source WEBSITE and no CRM link', async () => {
        const { prisma, service } = setup()
        await service.createRetail(retailOrder({ channel: 'ECOMMERCE' }))
        const data = prisma.sdSalesOrder.create.mock.calls[0][0].data
        expect(data).toMatchObject({ channel: 'ECOMMERCE', source: 'WEBSITE' })
        expect(data.crmOpportunityId).toBeUndefined()
    })

    it('holds stock at checkout but keeps e-commerce orders DRAFT (hybrid approval)', async () => {
        const { prisma, service, mmPipeline } = setup()
        await service.createRetail(retailOrder({ channel: 'ECOMMERCE' }))
        expect(
            prisma.sdSalesOrder.create.mock.calls[0][0].data,
        ).toMatchObject({ status: 'DRAFT' })
        // Soft-hold (reservation) runs now; the order still awaits admin approval.
        expect(mmPipeline.integrateConfirmedOrder).toHaveBeenCalledWith('so-1')
    })

    it('creates POS orders as COMPLETED and runs the MM handoff', async () => {
        const { prisma, service, mmPipeline } = setup()
        await service.createRetail(
            retailOrder({
                channel: 'POS',
                branchId: 'BR_AWIC_DAVAO_MAIN',
                paymentReceived: 200,
            }),
        )
        expect(
            prisma.sdSalesOrder.create.mock.calls[0][0].data,
        ).toMatchObject({ status: 'COMPLETED' })
        expect(mmPipeline.integrateConfirmedOrder).toHaveBeenCalledWith('so-1')
    })

    it('maps each line to its division (header division is the default)', async () => {
        const { prisma, service } = setup()
        await service.createRetail(
            retailOrder({ channel: 'ECOMMERCE', divisionId: 'DIV_RETAIL' }),
        )
        const data = prisma.sdSalesOrder.create.mock.calls[0][0].data as {
            lines: { create: Array<Record<string, unknown>> }
        }
        expect(data.lines.create[0]).toMatchObject({
            divisionId: 'DIV_RETAIL',
            sku: 'SKU-1',
            integrationStatus: 'OPEN',
        })
    })

    it('marketplace checkout captures a DRAFT master order with per-line divisions and no handoff', async () => {
        const { service, mmPipeline } = setup()
        const result = await service.createMarketplaceCheckout(
            marketplaceCheckout({}),
        )
        expect(result.order.status).toBe('DRAFT')
        expect(result.order.lines.map((line) => line.divisionId)).toEqual([
            'DIV_RETAIL',
            'DIV_LPG',
        ])
        // Hybrid: checkout holds stock for the DRAFT order (reservation is idempotent).
        expect(mmPipeline.integrateConfirmedOrder).toHaveBeenCalledWith('so-1')
    })
})
