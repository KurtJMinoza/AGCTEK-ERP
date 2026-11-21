import { NotFoundException } from '@nestjs/common'
import { CrmCustomerRatingService } from './customer-rating.service'

describe('CrmCustomerRatingService', () => {
    const customerId = 'cust-1'
    const ratedBy = 'user-1'

    function setup(opts: { customer?: boolean; existingStars?: number | null } = {}) {
        const existing =
            opts.existingStars == null
                ? null
                : {
                      id: 'rating-1',
                      customerId,
                      stars: opts.existingStars,
                      comment: null,
                      ratedBy: 'old',
                      ratedAt: new Date('2026-01-01'),
                  }
        const tx = {
            crmCustomerRating: {
                findUnique: jest.fn().mockResolvedValue(existing),
                create: jest.fn().mockImplementation(({ data }) =>
                    Promise.resolve({ id: 'rating-new', ...data, ratedAt: new Date(), updatedAt: new Date() }),
                ),
                update: jest.fn().mockImplementation(({ data }) =>
                    Promise.resolve({
                        id: 'rating-1',
                        customerId,
                        ...data,
                        updatedAt: new Date(),
                    }),
                ),
            },
            crmCustomerRatingHistory: {
                create: jest.fn().mockImplementation(({ data }) =>
                    Promise.resolve({ id: 'hist-1', ...data, ratedAt: new Date() }),
                ),
            },
        }
        const prisma = {
            sdCustomer: {
                findUnique: jest
                    .fn()
                    .mockResolvedValue(opts.customer === false ? null : { id: customerId }),
            },
            crmCustomerRating: {
                findUnique: jest.fn().mockResolvedValue(existing),
            },
            crmCustomerRatingHistory: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
        }
        const service = new CrmCustomerRatingService(prisma as never)
        return { service, prisma, tx }
    }

    it('404s when the customer is missing', async () => {
        const { service } = setup({ customer: false })
        await expect(
            service.setRating(customerId, { stars: 5 }, ratedBy),
        ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('creates the first rating and appends history with null previousStars', async () => {
        const { service, tx } = setup()
        const result = await service.setRating(customerId, { stars: 4, comment: 'Solid' }, ratedBy)
        expect(tx.crmCustomerRating.create).toHaveBeenCalled()
        expect(tx.crmCustomerRatingHistory.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                customerId,
                stars: 4,
                previousStars: null,
                comment: 'Solid',
                ratedBy,
            }),
        })
        expect(result.current.stars).toBe(4)
    })

    it('updates an existing rating and records previousStars', async () => {
        const { service, tx } = setup({ existingStars: 3 })
        await service.setRating(customerId, { stars: 5 }, ratedBy)
        expect(tx.crmCustomerRating.update).toHaveBeenCalled()
        expect(tx.crmCustomerRatingHistory.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                stars: 5,
                previousStars: 3,
                ratedBy,
            }),
        })
    })
})
