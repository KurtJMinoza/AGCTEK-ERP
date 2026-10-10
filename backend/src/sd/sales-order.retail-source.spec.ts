import { UnauthorizedException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import type { PrismaService } from '../prisma/prisma.service'
import type { CreateRetailSalesOrderDto } from './dto/sales-order.dto'
import { SalesOrderService } from './sales-order.service'

function setup() {
    const prisma = {
        sdSalesOrder: {
            findUnique: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: 'so-1', ...args.data, lines: [] }),
            ),
        },
        sdProduct: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        sdProductVariant: {
            findMany: jest.fn().mockResolvedValue([]),
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
        resolveCheckoutCompanyId: jest.fn().mockResolvedValue('company-1'),
    }
    const service = new SalesOrderService(
        prisma as unknown as PrismaService,
        {} as never,
        retailClients as never,
        products as never,
        mmPipeline as never,
        {} as never,
        {} as never,
    )
    return { prisma, service }
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
        shippingAmount: 50,
        totalAmount: 250,
        ...overrides,
    }) as CreateRetailSalesOrderDto

describe('SalesOrderService retail order source', () => {
    it('stamps POS sales with channel POS / source POS', async () => {
        const { prisma, service } = setup()
        await service.createRetail(
            retailOrder({
                channel: 'POS',
                branchId: 'BR_AWIC_DAVAO_MAIN',
                shippingAmount: 0,
                totalAmount: 200,
                paymentReceived: 200,
            }),
        )
        expect(prisma.sdSalesOrder.create.mock.calls[0][0].data).toMatchObject({
            channel: 'POS',
            source: 'POS',
        })
    })

    it('stamps website orders with channel ECOMMERCE / source WEBSITE and no CRM link', async () => {
        const { prisma, service } = setup()
        await service.createRetail(retailOrder({ channel: 'ECOMMERCE' }), 'client-1')
        const data = prisma.sdSalesOrder.create.mock.calls[0][0].data
        expect(data).toMatchObject({ channel: 'ECOMMERCE', source: 'WEBSITE' })
        expect(data.crmOpportunityId).toBeUndefined()
    })

    it('rejects website orders without a session for the ordering customer', async () => {
        const { prisma, service } = setup()
        await expect(
            service.createRetail(retailOrder({ channel: 'ECOMMERCE' })),
        ).rejects.toBeInstanceOf(UnauthorizedException)
        await expect(
            service.createRetail(retailOrder({ channel: 'ECOMMERCE' }), 'someone-else'),
        ).rejects.toBeInstanceOf(UnauthorizedException)
        expect(prisma.sdSalesOrder.create).not.toHaveBeenCalled()
    })
})
