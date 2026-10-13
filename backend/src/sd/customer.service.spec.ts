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
        retailClient: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: 'shop-1', ...args.data }),
            ),
        },
        sdCustomer: {
            count: jest.fn().mockResolvedValue(4),
            create: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: 'cust-new', ...args.data }),
            ),
            findUnique: jest.fn().mockResolvedValue({
                id: 'cust-new',
                customerNumber: 'CUST-000005',
                retailClientId: 'shop-1',
            }),
            update: jest.fn((args: { data: Record<string, unknown> }) =>
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

    it('provisions a Shop account (with password) and links it to the customer', async () => {
        const root = mockClient()
        const service = new CustomerService(root as unknown as PrismaService)

        const created = await service.create({
            ...dto,
            password: 'shopPass123',
        })

        expect(root.retailClient.create).toHaveBeenCalledTimes(1)
        const shopData = root.retailClient.create.mock.calls[0][0].data
        expect(shopData.email).toBe('ann@acme.test')
        expect(shopData.passwordHash).toBeTruthy()
        expect(root.sdCustomer.update).toHaveBeenCalledWith({
            where: { id: 'cust-new' },
            data: { retailClientId: 'shop-1' },
        })
        expect(created.retailClientId).toBe('shop-1')
    })

    it('rejects a provisioning password when a Shop account already exists', async () => {
        const root = mockClient()
        root.retailClient.findUnique.mockResolvedValue({ id: 'shop-existing' })
        const service = new CustomerService(root as unknown as PrismaService)

        await expect(
            service.create({ ...dto, password: 'shopPass123' }),
        ).rejects.toThrow(ConflictException)
        expect(root.retailClient.create).not.toHaveBeenCalled()
    })
})
