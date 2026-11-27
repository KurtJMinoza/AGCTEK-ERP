import { NotFoundException } from '@nestjs/common'
import { PERMISSION_KEY } from '../../permissions/permission.guard'
import type { PrismaService } from '../../prisma/prisma.service'
import { CrmCustomerRatingsController } from './customer-ratings.controller'
import { CrmCustomerRatingsService } from './customer-ratings.service'

function mockPrisma(opts: { customer?: boolean; profile?: boolean } = {}) {
    const hasCustomer = opts.customer !== false
    const hasProfile = opts.profile === true
    const tx = {
        crmProfile: {
            findUnique: jest.fn().mockResolvedValue(
                hasProfile
                    ? { customerId: 'cust-1', ratingStars: 3, ratedAt: new Date(), ratedBy: 'u0' }
                    : null,
            ),
            create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
            update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
        },
        crmCustomerRatingEvent: {
            create: jest.fn().mockImplementation(({ data }) =>
                Promise.resolve({ id: 'evt-1', ...data }),
            ),
        },
    }
    return {
        sdCustomer: {
            findUnique: jest.fn().mockResolvedValue(hasCustomer ? { id: 'cust-1' } : null),
        },
        crmCustomerRatingEvent: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
        __tx: tx,
    }
}

describe('CrmCustomerRatingsService', () => {
    it('404 when customer is missing', async () => {
        const prisma = mockPrisma({ customer: false })
        const service = new CrmCustomerRatingsService(prisma as unknown as PrismaService)
        await expect(service.rate('missing', { stars: 5 }, 'u1')).rejects.toBeInstanceOf(
            NotFoundException,
        )
    })

    it('creates profile + history on first rating', async () => {
        const prisma = mockPrisma({ profile: false })
        const service = new CrmCustomerRatingsService(prisma as unknown as PrismaService)
        const event = await service.rate('cust-1', { stars: 5, comment: 'Great' }, 'u1')

        expect(event).toMatchObject({
            customerId: 'cust-1',
            stars: 5,
            comment: 'Great',
            previousStars: null,
            ratedBy: 'u1',
        })
        expect(prisma.__tx.crmProfile.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    customerId: 'cust-1',
                    ratingStars: 5,
                    ratedBy: 'u1',
                }),
            }),
        )
        expect(prisma.__tx.crmCustomerRatingEvent.create).toHaveBeenCalled()
    })

    it('updates snapshot and records previousStars on change', async () => {
        const prisma = mockPrisma({ profile: true })
        const service = new CrmCustomerRatingsService(prisma as unknown as PrismaService)
        await service.rate('cust-1', { stars: 2 }, 'u2')

        expect(prisma.__tx.crmCustomerRatingEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    stars: 2,
                    previousStars: 3,
                    ratedBy: 'u2',
                }),
            }),
        )
        expect(prisma.__tx.crmProfile.update).toHaveBeenCalled()
        expect(prisma.__tx.crmProfile.create).not.toHaveBeenCalled()
    })
})

describe('CrmCustomerRatingsController RBAC metadata', () => {
    it('rate requires crm.customers:update', () => {
        expect(
            Reflect.getMetadata(PERMISSION_KEY, CrmCustomerRatingsController.prototype.rate),
        ).toEqual({
            resource: 'crm.customers',
            action: 'update',
        })
    })
})
