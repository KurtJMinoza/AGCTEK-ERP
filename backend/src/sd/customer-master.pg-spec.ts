/**
 * Customer Master ↔ order identity against a real PostgreSQL database (`npm run test:pg`).
 * Storefront orders store the shop account id; `listForCustomerMaster` must still return them for
 * the Customer Master through the `SdCustomer.retailClientId` link, never through email alone.
 * Creates its own tagged customers, shop accounts and orders and deletes them afterwards.
 */
import 'reflect-metadata'
import { Prisma, PrismaClient } from '@prisma/client'
import { SalesOrderService } from './sales-order.service'

jest.setTimeout(120_000)

const prisma = new PrismaClient()
const tag = `PGCM-${Date.now()}`

describe('Customer Master orders on PostgreSQL', () => {
    const salesOrders = new SalesOrderService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
    )
    const customerIds: string[] = []
    const shopIds: string[] = []
    let n = 0

    const shop = async (email: string) => {
        const row = await prisma.retailClient.create({
            data: { email, passwordHash: 'x', fullName: `${tag} shopper` },
        })
        shopIds.push(row.id)
        return row.id
    }
    const master = async (email: string, retailClientId: string | null = null) => {
        const row = await prisma.sdCustomer.create({
            data: {
                customerNumber: `${tag}-${++n}`,
                companyName: `${tag} customer ${n}`,
                contactName: 'PG test',
                email,
                currency: 'PHP',
                status: 'ACTIVE',
                customerType: 'RETAIL',
                retailClientId,
            },
        })
        customerIds.push(row.id)
        return row.id
    }
    const order = (customerId: string, suffix: string, email: string) =>
        prisma.sdSalesOrder.create({
            data: {
                orderNumber: `${tag}-${suffix}`,
                customerId,
                customerEmail: email,
                channel: 'ECOMMERCE',
                status: 'CONFIRMED',
                currency: 'PHP',
                totalAmount: new Prisma.Decimal('100'),
                correlationId: `${tag}-corr-${suffix}`,
            },
        })

    afterAll(async () => {
        try {
            await prisma.sdSalesOrder.deleteMany({ where: { orderNumber: { startsWith: tag } } })
            await prisma.sdCustomer.deleteMany({ where: { id: { in: customerIds } } })
            await prisma.retailClient.deleteMany({ where: { id: { in: shopIds } } })
        } finally {
            await prisma.$disconnect()
        }
    })

    it('lists orders on the master id and on its linked shop account, newest first, with the total', async () => {
        const email = `${tag.toLowerCase()}-a@pg-test.invalid`
        const shopId = await shop(email)
        const masterId = await master(email, shopId)
        await order(masterId, 'A1', email)
        await order(shopId, 'A2', email)
        await order(shopId, 'A3', email)
        const stranger = await master(`${tag.toLowerCase()}-x@pg-test.invalid`)
        await order(stranger, 'X1', 'someone@pg-test.invalid')

        const result = await salesOrders.listForCustomerMaster(masterId, 2)

        expect(result.total).toBe(3)
        expect(result.rows.map((o) => o.orderNumber)).toEqual([`${tag}-A3`, `${tag}-A2`])
        expect(result.unlinkedShopAccounts).toEqual([])
    })

    it('does not adopt an unlinked same-email shop account, but reports it', async () => {
        const email = `${tag.toLowerCase()}-b@pg-test.invalid`
        const shopId = await shop(email)
        const masterId = await master(email.toUpperCase())
        await order(shopId, 'B1', email)

        const result = await salesOrders.listForCustomerMaster(masterId)

        expect(result.total).toBe(0)
        expect(result.rows).toEqual([])
        expect(result.unlinkedShopAccounts).toEqual([{ id: shopId, email }])
    })

    it('404s for an unknown Customer Master', async () => {
        await expect(salesOrders.listForCustomerMaster('missing')).rejects.toMatchObject({ status: 404 })
    })
})
