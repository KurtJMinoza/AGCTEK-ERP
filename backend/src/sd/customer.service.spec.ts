import { ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { PrismaService } from '../prisma/prisma.service'
import { CustomerService } from './customer.service'

const numberCollision = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['customerNumber'] },
    })

function mockClient() {
    return {
        sdCustomer: {
            count: jest.fn().mockResolvedValue(4),
            create: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: 'cust-new', ...args.data }),
            ),
        },
    }
}

const dto = { companyName: 'Acme', contactName: 'Ann', email: 'ann@acme.test', creditLimit: 0 }

describe('CustomerService.create', () => {
    it('writes through a caller-supplied transaction client', async () => {
        const root = mockClient()
        const tx = mockClient()
        const service = new CustomerService(root as unknown as PrismaService)

        const created = await service.create(dto, tx as unknown as Prisma.TransactionClient)

        expect(created.customerNumber).toBe('CUST-000005')
        expect(tx.sdCustomer.create).toHaveBeenCalledTimes(1)
        expect(root.sdCustomer.create).not.toHaveBeenCalled()
        expect(root.sdCustomer.count).not.toHaveBeenCalled()
    })

    it('retries a number collision on the root client', async () => {
        const root = mockClient()
        root.sdCustomer.create.mockRejectedValueOnce(numberCollision())
        const service = new CustomerService(root as unknown as PrismaService)

        await service.create(dto)

        expect(root.sdCustomer.create).toHaveBeenCalledTimes(2)
    })

    it('does not retry inside a transaction (the statement aborted it)', async () => {
        const root = mockClient()
        const tx = mockClient()
        tx.sdCustomer.create.mockRejectedValueOnce(numberCollision())
        const service = new CustomerService(root as unknown as PrismaService)

        await expect(
            service.create(dto, tx as unknown as Prisma.TransactionClient),
        ).rejects.toBeInstanceOf(ConflictException)
        expect(tx.sdCustomer.create).toHaveBeenCalledTimes(1)
    })
})
