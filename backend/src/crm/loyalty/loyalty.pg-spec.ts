/**
 * Loyalty accrual against a real PostgreSQL database (`npm run test:pg`, uses DATABASE_URL).
 * Proves what the mocked spec cannot: the account row lock makes an EARN per sales order post
 * once under concurrent requests, first-time earns create a single account, and concurrent
 * redeems never take the balance below zero. Creates its own tagged customers and orders and
 * deletes them afterwards.
 */
import 'reflect-metadata'
import { Prisma, PrismaClient } from '@prisma/client'
import { SalesOrderService } from '../../sd/sales-order.service'
import { CrmLoyaltyService } from './loyalty.service'

jest.setTimeout(180_000)

const prisma = new PrismaClient()
const tag = `PGLOY-${Date.now()}`
const code = (err: any): string =>
    err?.code ?? err?.response?.code ?? err?.response?.message ?? err?.message
const settle = async <T>(promises: Promise<T>[]) => {
    const results = await Promise.allSettled(promises)
    return {
        ok: results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
        errors: results.flatMap((r) => (r.status === 'rejected' ? [code(r.reason)] : [])),
    }
}

describe('Loyalty accrual on PostgreSQL', () => {
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
    const loyalty = new CrmLoyaltyService(prisma as never, salesOrders)
    const customerIds: string[] = []
    let userId: string

    const newCustomer = async () => {
        const n = customerIds.length
        const customer = await prisma.sdCustomer.create({
            data: {
                customerNumber: `${tag}-${n}`,
                companyName: `${tag} customer ${n}`,
                contactName: 'PG test',
                email: `${tag.toLowerCase()}-${n}@pg-test.invalid`,
                currency: 'PHP',
                status: 'ACTIVE',
            },
        })
        customerIds.push(customer.id)
        return customer.id
    }

    const ledgerSum = async (customerId: string) => {
        const rows = await prisma.crmLoyaltyTransaction.aggregate({
            where: { loyaltyAccount: { customerId } },
            _sum: { points: true },
        })
        return rows._sum.points ?? 0
    }

    beforeAll(async () => {
        const admin =
            (await prisma.user.findFirst({ where: { role: 'super_admin' } })) ??
            (await prisma.user.findFirstOrThrow())
        userId = admin.id
    })

    beforeEach(() => {
        process.env.LOYALTY_MOCK_ACCRUAL = 'true'
    })

    afterEach(() => {
        delete process.env.LOYALTY_MOCK_ACCRUAL
    })

    afterAll(async () => {
        try {
            await prisma.crmLoyaltyTransaction.deleteMany({ where: { loyaltyAccount: { customerId: { in: customerIds } } } })
            await prisma.crmLoyaltyAccount.deleteMany({ where: { customerId: { in: customerIds } } })
            await prisma.sdSalesOrder.deleteMany({ where: { customerId: { in: customerIds } } })
            await prisma.sdCustomer.deleteMany({ where: { id: { in: customerIds } } })
        } finally {
            await prisma.$disconnect()
        }
    })

    it('posts one EARN per sales order when the same mock earn is sent at once', async () => {
        const customerId = await newCustomer()
        const order = await prisma.sdSalesOrder.create({
            data: {
                orderNumber: `${tag}-SO-1`,
                customerId,
                status: 'DELIVERED',
                currency: 'PHP',
                totalAmount: new Prisma.Decimal('12345.67'),
                correlationId: `${tag}-corr-1`,
            },
        })

        const { ok, errors } = await settle(
            [1, 2, 3, 4, 5].map(() => loyalty.mockEarn(customerId, { salesOrderId: order.id }, userId)),
        )

        expect(errors).toEqual([])
        expect(ok.filter((r) => r.created)).toHaveLength(1)
        const rows = await prisma.crmLoyaltyTransaction.findMany({ where: { loyaltyAccount: { customerId } } })
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ type: 'EARN', points: 123, referenceType: 'SALES_ORDER', referenceId: order.id })
        const account = await prisma.crmLoyaltyAccount.findUniqueOrThrow({ where: { customerId } })
        expect(account).toMatchObject({ pointsBalance: 123, tier: 'BRONZE' })
    })

    it('creates a single account when several first-time earns race', async () => {
        const customerId = await newCustomer()

        const { errors } = await settle(
            [400, 300, 200, 100].map((points) => loyalty.mockEarn(customerId, { points }, userId)),
        )

        expect(errors).toEqual([])
        expect(await prisma.crmLoyaltyAccount.count({ where: { customerId } })).toBe(1)
        const summary = await loyalty.getForCustomer(customerId)
        expect(summary).toMatchObject({ pointsBalance: 1_000, tier: 'SILVER', mockAccrual: true })
        expect(summary.transactions).toHaveLength(4)
        expect(await ledgerSum(customerId)).toBe(1_000)
    })

    it('never lets concurrent redeems take the balance below zero', async () => {
        const customerId = await newCustomer()
        await loyalty.accruePoints({ customerId, type: 'EARN', points: 100, referenceType: 'MOCK' })

        const { ok, errors } = await settle(
            [1, 2, 3].map(() => loyalty.accruePoints({ customerId, type: 'REDEEM', points: -60, note: 'voucher' })),
        )

        expect(ok).toHaveLength(1)
        expect(errors).toHaveLength(2)
        expect(errors.every((e) => /Not enough points/.test(e))).toBe(true)
        const account = await prisma.crmLoyaltyAccount.findUniqueOrThrow({ where: { customerId } })
        expect(account.pointsBalance).toBe(40)
        expect(await ledgerSum(customerId)).toBe(40)
    })

    it('refuses mock earn when the flag is off', async () => {
        const customerId = await newCustomer()
        delete process.env.LOYALTY_MOCK_ACCRUAL

        await expect(loyalty.mockEarn(customerId, { points: 10 }, userId)).rejects.toMatchObject({ status: 403 })
        expect(await prisma.crmLoyaltyAccount.count({ where: { customerId } })).toBe(0)
    })
})
