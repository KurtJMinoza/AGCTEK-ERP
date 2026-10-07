import { Decimal } from '@prisma/client/runtime/library'
import type { PrismaService } from '../prisma/prisma.service'
import type { CreateRetailSalesOrderDto } from './dto/sales-order.dto'
import { SalesOrderService } from './sales-order.service'

function setup() {
    const prisma = {
        sdSalesOrder: {
            findUnique: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: 'so-1', ...args.data, lines: [] }),
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
        shippingAmount: 0,
        totalAmount: 200,
        ...overrides,
    }) as CreateRetailSalesOrderDto

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
})
