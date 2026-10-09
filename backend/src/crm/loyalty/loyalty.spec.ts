import { NotFoundException } from '@nestjs/common'
import { PERMISSION_KEY } from '../../permissions/permission.guard'
import type { PrismaService } from '../../prisma/prisma.service'
import { CrmLoyaltyController } from './loyalty.controller'
import { CrmLoyaltyService } from './loyalty.service'

function mockPrisma(opts: { customer?: boolean; account?: unknown } = {}) {
    return {
        sdCustomer: {
            findUnique: jest.fn().mockResolvedValue(opts.customer === false ? null : { id: 'cust-1' }),
        },
        crmLoyaltyAccount: {
            findUnique: jest.fn().mockResolvedValue(opts.account ?? null),
            create: jest.fn(),
            upsert: jest.fn(),
        },
    }
}

const service = (prisma: ReturnType<typeof mockPrisma>) =>
    new CrmLoyaltyService(prisma as unknown as PrismaService)

describe('CrmLoyaltyService', () => {
    it('returns 404 only when the SdCustomer itself is missing', async () => {
        const prisma = mockPrisma({ customer: false })
        await expect(service(prisma).getForCustomer('missing')).rejects.toBeInstanceOf(
            NotFoundException,
        )
        expect(prisma.crmLoyaltyAccount.findUnique).not.toHaveBeenCalled()
    })

    it('returns an empty default when the customer has no loyalty account, without creating one', async () => {
        const prisma = mockPrisma()
        await expect(service(prisma).getForCustomer('cust-1')).resolves.toEqual({
            accountId: null,
            customerId: 'cust-1',
            pointsBalance: 0,
            tier: null,
            transactions: [],
        })
        expect(prisma.crmLoyaltyAccount.create).not.toHaveBeenCalled()
        expect(prisma.crmLoyaltyAccount.upsert).not.toHaveBeenCalled()
    })

    it('returns the account with its most recent transactions', async () => {
        const tx = { id: 'tx-1', type: 'EARN', points: 120 }
        const prisma = mockPrisma({
            account: { id: 'acct-1', pointsBalance: 120, tier: 'SILVER', transactions: [tx] },
        })
        await expect(service(prisma).getForCustomer('cust-1')).resolves.toEqual({
            accountId: 'acct-1',
            customerId: 'cust-1',
            pointsBalance: 120,
            tier: 'SILVER',
            transactions: [tx],
        })
        expect(prisma.crmLoyaltyAccount.findUnique).toHaveBeenCalledWith({
            where: { customerId: 'cust-1' },
            include: { transactions: { orderBy: { createdAt: 'desc' }, take: 50 } },
        })
    })
})

describe('CrmLoyaltyController RBAC metadata', () => {
    it('getForCustomer requires crm.loyalty:read', () => {
        expect(
            Reflect.getMetadata(PERMISSION_KEY, CrmLoyaltyController.prototype.getForCustomer),
        ).toEqual({ resource: 'crm.loyalty', action: 'read' })
    })
})
