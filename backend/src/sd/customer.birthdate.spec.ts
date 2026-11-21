import { BadRequestException } from '@nestjs/common'
import { CustomerService } from './customer.service'

/** Access the private date helper through update/create validation paths. */
describe('CustomerService birthDate validation', () => {
    function serviceWith(current: Record<string, unknown> = {}) {
        const row = {
            id: 'cust-1',
            creditLimit: { toNumber: () => 0 },
            availableCredit: { toNumber: () => 0 },
            customerAccountType: 'NON_CREDIT',
            ...current,
        }
        const prisma = {
            sdCustomer: {
                findUnique: jest.fn().mockResolvedValue(row),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
        }
        return new CustomerService(prisma as never)
    }

    it('rejects a future birthDate', async () => {
        const service = serviceWith()
        await expect(
            service.update('cust-1', { birthDate: '2099-01-01' }),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('accepts a past date-only birthDate', async () => {
        const service = serviceWith()
        const prisma = (service as unknown as { prisma: { sdCustomer: { updateMany: jest.Mock; findUnique: jest.Mock } } })
            .prisma
        await service.update('cust-1', { birthDate: '1990-05-15' })
        expect(prisma.sdCustomer.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    birthDate: new Date(Date.UTC(1990, 4, 15)),
                }),
            }),
        )
    })

    it('clears birthDate when null is sent', async () => {
        const service = serviceWith({ birthDate: new Date('1990-05-15') })
        const prisma = (service as unknown as { prisma: { sdCustomer: { updateMany: jest.Mock } } })
            .prisma
        await service.update('cust-1', { birthDate: null })
        expect(prisma.sdCustomer.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ birthDate: null }),
            }),
        )
    })
})
