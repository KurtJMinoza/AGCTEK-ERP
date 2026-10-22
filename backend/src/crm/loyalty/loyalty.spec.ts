import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PERMISSION_KEY } from '../../permissions/permission.guard'
import { CrmLoyaltyController } from './loyalty.controller'
import { CrmLoyaltyService, tierForBalance } from './loyalty.service'

type Txn = {
    id: string
    loyaltyAccountId: string
    type: string
    points: number
    referenceType: string | null
    referenceId: string | null
    note: string | null
    createdBy: string | null
}

/** In-memory account + ledger with the queries CrmLoyaltyService uses. */
function fakeDb(opts: { customer?: boolean; balance?: number | null } = {}) {
    let account: { id: string; customerId: string; pointsBalance: number; tier: string } | null =
        opts.balance === undefined || opts.balance === null
            ? null
            : { id: 'acct-1', customerId: 'cust-1', pointsBalance: opts.balance, tier: tierForBalance(opts.balance) }
    const txns: Txn[] = []
    const prisma = {
        sdCustomer: {
            findUnique: jest.fn().mockResolvedValue(opts.customer === false ? null : { id: 'cust-1' }),
            findFirst: jest.fn().mockResolvedValue({ id: 'cust-1' }),
        },
        crmLoyaltyAccount: {
            findUnique: jest.fn(async () =>
                account ? { ...account, transactions: [...txns].reverse() } : null,
            ),
            upsert: jest.fn(async ({ create }: { create: { customerId: string } }) => {
                account ??= { id: 'acct-1', customerId: create.customerId, pointsBalance: 0, tier: 'BRONZE' }
                return { id: account.id }
            }),
            findUniqueOrThrow: jest.fn(async () => ({ pointsBalance: account!.pointsBalance })),
            update: jest.fn(async ({ data }: { data: { pointsBalance: number; tier: string } }) => {
                Object.assign(account!, data)
                return account
            }),
        },
        crmLoyaltyTransaction: {
            findFirst: jest.fn(async ({ where }: { where: Partial<Txn> }) =>
                txns.find(
                    (t) =>
                        t.type === where.type &&
                        t.referenceType === where.referenceType &&
                        t.referenceId === where.referenceId,
                ) ?? null,
            ),
            create: jest.fn(async ({ data }: { data: Omit<Txn, 'id'> }) => {
                const row = { id: `tx-${txns.length + 1}`, ...data }
                txns.push(row)
                return row
            }),
        },
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'acct-1' }]),
        $transaction: jest.fn(),
    }
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
    return { prisma, txns, account: () => account }
}

const order = (overrides: Record<string, unknown> = {}) => ({
    id: 'so-1',
    orderNumber: 'SO-000123',
    customerId: 'shop-1',
    status: 'DELIVERED',
    currency: 'PHP',
    totalAmount: new Decimal('2549.99'),
    ...overrides,
})

function setup(opts: Parameters<typeof fakeDb>[0] = {}) {
    const db = fakeDb(opts)
    const salesOrders = { findOne: jest.fn().mockResolvedValue(order()) }
    const service = new CrmLoyaltyService(db.prisma as never, salesOrders as never)
    return { ...db, salesOrders, service }
}

const earn = { customerId: 'cust-1', type: 'EARN' as const, points: 120 }

afterEach(() => {
    delete process.env.LOYALTY_MOCK_ACCRUAL
    delete process.env.LOYALTY_POINTS_PER_100_PHP
})

describe('CrmLoyaltyService reads', () => {
    it('returns 404 only when the SdCustomer itself is missing', async () => {
        const { prisma, service } = setup({ customer: false })
        await expect(service.getForCustomer('missing')).rejects.toBeInstanceOf(NotFoundException)
        expect(prisma.crmLoyaltyAccount.findUnique).not.toHaveBeenCalled()
    })

    it('returns an empty default without creating an account, and reports the mock switch', async () => {
        const { prisma, service } = setup()
        await expect(service.getForCustomer('cust-1')).resolves.toEqual({
            accountId: null,
            customerId: 'cust-1',
            pointsBalance: 0,
            tier: null,
            transactions: [],
            mockAccrual: false,
        })
        expect(prisma.crmLoyaltyAccount.upsert).not.toHaveBeenCalled()

        process.env.LOYALTY_MOCK_ACCRUAL = 'true'
        await expect(service.getForCustomer('cust-1')).resolves.toMatchObject({ mockAccrual: true })
    })

    it('reads the 50 most recent transactions', async () => {
        const { prisma, service } = setup({ balance: 120 })
        await service.getForCustomer('cust-1')
        expect(prisma.crmLoyaltyAccount.findUnique).toHaveBeenCalledWith({
            where: { customerId: 'cust-1' },
            include: { transactions: { orderBy: { createdAt: 'desc' }, take: 50 } },
        })
    })
})

describe('tierForBalance', () => {
    it.each([
        [0, 'BRONZE'],
        [999, 'BRONZE'],
        [1_000, 'SILVER'],
        [4_999, 'SILVER'],
        [5_000, 'GOLD'],
        [19_999, 'GOLD'],
        [20_000, 'PLATINUM'],
    ])('%i points → %s', (balance, tier) => {
        expect(tierForBalance(balance)).toBe(tier)
    })
})

describe('CrmLoyaltyService.accruePoints', () => {
    it('creates the account on the first earn, appends the row and moves balance and tier together', async () => {
        const { prisma, service, txns, account } = setup()

        const result = await service.accruePoints({ ...earn, points: 1_200, note: 'first', createdBy: 'u-1' })

        expect(prisma.crmLoyaltyAccount.upsert).toHaveBeenCalledWith({
            where: { customerId: 'cust-1' },
            create: { customerId: 'cust-1' },
            update: {},
            select: { id: true },
        })
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
        expect(txns).toEqual([
            {
                id: 'tx-1',
                loyaltyAccountId: 'acct-1',
                type: 'EARN',
                points: 1_200,
                referenceType: null,
                referenceId: null,
                note: 'first',
                createdBy: 'u-1',
            },
        ])
        expect(account()).toMatchObject({ pointsBalance: 1_200, tier: 'SILVER' })
        expect(result).toMatchObject({ created: true, summary: { pointsBalance: 1_200, tier: 'SILVER' } })
    })

    it('posts an EARN for the same reference once', async () => {
        const { service, txns, account } = setup()
        const bySo = { ...earn, referenceType: 'SALES_ORDER', referenceId: 'so-1' }

        await service.accruePoints(bySo)
        const again = await service.accruePoints(bySo)

        expect(again.created).toBe(false)
        expect(again.transaction.id).toBe('tx-1')
        expect(txns).toHaveLength(1)
        expect(account()!.pointsBalance).toBe(120)
    })

    it('keeps the balance at or above zero on redeem', async () => {
        const { service, txns, account } = setup({ balance: 100 })

        await expect(service.accruePoints({ ...earn, type: 'REDEEM', points: -101 })).rejects.toThrow(
            'Not enough points: the balance is 100, this would deduct 101',
        )
        expect(txns).toHaveLength(0)

        await service.accruePoints({ ...earn, type: 'REDEEM', points: -100 })
        expect(account()).toMatchObject({ pointsBalance: 0, tier: 'BRONZE' })
    })

    it('drops the tier when the balance falls under a threshold', async () => {
        const { service, account } = setup({ balance: 5_200 })
        await service.accruePoints({ ...earn, type: 'ADJUSTMENT', points: -300, note: 'correction' })
        expect(account()).toMatchObject({ pointsBalance: 4_900, tier: 'SILVER' })
    })

    it.each([
        [{ points: 0 }, /other than zero/],
        [{ points: 1.5 }, /whole number/],
        [{ points: -5 }, /EARN adds points/],
        [{ type: 'REDEEM' as const, points: 5 }, /REDEEM deducts points/],
        [{ type: 'EXPIRE' as never }, /Unknown loyalty transaction type/],
        [{ referenceId: 'so-1' }, /needs a referenceType/],
    ])('rejects %o before touching the database', async (patch, message) => {
        const { prisma, service } = setup()
        await expect(service.accruePoints({ ...earn, ...patch })).rejects.toThrow(message)
        expect(prisma.sdCustomer.findUnique).not.toHaveBeenCalled()
    })

    it('404s for a missing customer without creating an account', async () => {
        const { prisma, service } = setup({ customer: false })
        await expect(service.accruePoints(earn)).rejects.toThrow(NotFoundException)
        expect(prisma.crmLoyaltyAccount.upsert).not.toHaveBeenCalled()
    })
})

describe('CrmLoyaltyService.mockEarn', () => {
    beforeEach(() => {
        process.env.LOYALTY_MOCK_ACCRUAL = 'true'
    })

    it('is refused (403) unless LOYALTY_MOCK_ACCRUAL=true', async () => {
        delete process.env.LOYALTY_MOCK_ACCRUAL
        const { service, txns } = setup()
        await expect(service.mockEarn('cust-1', { points: 10 }, 'u-1')).rejects.toThrow(ForbiddenException)
        expect(txns).toHaveLength(0)
    })

    it('earns floor(total / 100) points per sales order, once, resolving the shop account', async () => {
        const { prisma, service, txns, salesOrders } = setup()

        const first = await service.mockEarn('cust-1', { salesOrderId: 'so-1', note: 'demo' }, 'u-1')
        const second = await service.mockEarn('cust-1', { salesOrderId: 'so-1' }, 'u-1')

        expect(salesOrders.findOne).toHaveBeenCalledWith('so-1')
        expect(prisma.sdCustomer.findFirst).toHaveBeenCalledWith({
            where: { OR: [{ id: 'shop-1' }, { retailClientId: 'shop-1' }] },
            select: { id: true },
        })
        expect(txns).toEqual([
            expect.objectContaining({
                type: 'EARN',
                points: 25,
                referenceType: 'SALES_ORDER',
                referenceId: 'so-1',
                note: 'Mock accrual · SO-000123 (2549.99 PHP) · demo',
                createdBy: 'u-1',
            }),
        ])
        expect(first).toMatchObject({ created: true, summary: { pointsBalance: 25 } })
        expect(second).toMatchObject({ created: false, summary: { pointsBalance: 25 } })
    })

    it('applies LOYALTY_POINTS_PER_100_PHP and prefers the order when points are also sent', async () => {
        process.env.LOYALTY_POINTS_PER_100_PHP = '3'
        const { service, txns } = setup()
        await service.mockEarn('cust-1', { salesOrderId: 'so-1', points: 999 }, 'u-1')
        expect(txns[0]).toMatchObject({ points: 75, referenceType: 'SALES_ORDER' })
    })

    it('grants explicit points as a MOCK earn', async () => {
        const { service, txns } = setup()
        const result = await service.mockEarn('cust-1', { points: 500, note: 'launch promo' }, 'u-1')
        expect(txns[0]).toMatchObject({
            type: 'EARN',
            points: 500,
            referenceType: 'MOCK',
            referenceId: null,
            note: 'Mock grant · launch promo',
        })
        expect(result.summary.pointsBalance).toBe(500)
    })

    it.each([
        [{ customerId: 'someone-else' }, 'another customer', true],
        [{ status: 'CANCELLED' }, 'is CANCELLED', false],
        [{ status: 'DRAFT' }, 'is DRAFT', false],
        [{ currency: 'USD' }, 'is in USD', false],
        [{ totalAmount: new Decimal('99.99') }, 'earns no points', false],
    ])('refuses order %o', async (patch, message, otherCustomer) => {
        const { prisma, service, salesOrders, txns } = setup()
        salesOrders.findOne.mockResolvedValue(order(patch))
        if (otherCustomer) prisma.sdCustomer.findFirst.mockResolvedValue({ id: 'cust-2' })

        await expect(service.mockEarn('cust-1', { salesOrderId: 'so-1' }, 'u-1')).rejects.toThrow(message)
        expect(txns).toHaveLength(0)
    })

    it('needs points or a sales order', async () => {
        const { service } = setup()
        await expect(service.mockEarn('cust-1', {}, 'u-1')).rejects.toThrow(BadRequestException)
    })

    it('404s for a missing customer', async () => {
        const { service } = setup({ customer: false })
        await expect(service.mockEarn('missing', { points: 5 }, 'u-1')).rejects.toThrow(NotFoundException)
    })
})

describe('CrmLoyaltyController RBAC metadata', () => {
    const meta = (handler: keyof CrmLoyaltyController) =>
        Reflect.getMetadata(PERMISSION_KEY, CrmLoyaltyController.prototype[handler])

    it('reads with crm.loyalty:read and mock-earns with crm.loyalty:update', () => {
        expect(meta('getForCustomer')).toEqual({ resource: 'crm.loyalty', action: 'read' })
        expect(meta('mockEarn')).toEqual({ resource: 'crm.loyalty', action: 'update' })
    })
})
