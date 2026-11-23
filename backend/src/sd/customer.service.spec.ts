import { BadRequestException, ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import type { PrismaService } from '../prisma/prisma.service'
import { CustomerService, parseCustomerBirthDate } from './customer.service'

const numberCollision = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['customerNumber'] },
    })

function mockClient() {
    const client = {
        sdCustomer: {
            count: jest.fn().mockResolvedValue(4),
            create: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: 'cust-new', ...args.data }),
            ),
        },
        $transaction: jest.fn(),
    }
    client.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(client))
    return client
}

const makeService = (root: ReturnType<typeof mockClient>) =>
    new CustomerService(root as unknown as PrismaService)

const dto = {
    companyName: 'Acme',
    contactName: 'Ann',
    email: 'ann@acme.test',
    creditLimit: 0,
}

describe('CustomerService.create', () => {
    it('writes through a caller-supplied transaction client', async () => {
        const root = mockClient()
        const tx = mockClient()
        const service = makeService(root)

        const created = await service.create(dto, tx as unknown as Prisma.TransactionClient)

        expect(created.customerNumber).toBe('CUST-000005')
        expect(tx.sdCustomer.create).toHaveBeenCalledTimes(1)
        expect(root.sdCustomer.create).not.toHaveBeenCalled()
        expect(root.sdCustomer.count).not.toHaveBeenCalled()
    })

    it('retries a number collision on the root client', async () => {
        const root = mockClient()
        root.sdCustomer.create.mockRejectedValueOnce(numberCollision())
        const service = makeService(root)

        await service.create(dto)

        expect(root.sdCustomer.create).toHaveBeenCalledTimes(2)
    })

    it('does not retry inside a transaction (the statement aborted it)', async () => {
        const root = mockClient()
        const tx = mockClient()
        tx.sdCustomer.create.mockRejectedValueOnce(numberCollision())
        const service = makeService(root)

        await expect(
            service.create(dto, tx as unknown as Prisma.TransactionClient),
        ).rejects.toBeInstanceOf(ConflictException)
        expect(tx.sdCustomer.create).toHaveBeenCalledTimes(1)
    })

    it('defaults to a NON_CREDIT walk-in customer', async () => {
        const root = mockClient()
        const created = await makeService(root).create({ ...dto })

        expect(created).toMatchObject({
            customerAccountType: 'NON_CREDIT',
            customerCategory: 'RETAIL',
            paymentTerms: 'IMMEDIATE',
            creditStatus: 'NOT_APPLICABLE',
        })
        expect(root.$transaction).not.toHaveBeenCalled()
    })

    it('creates a CREDIT customer with a limit and pending status', async () => {
        const root = mockClient()
        const created = await makeService(root).create({
            ...dto,
            customerAccountType: 'CREDIT',
            customerCategory: 'CORPORATE',
            creditLimit: 50000,
            paymentTerms: 'NET_30',
            creditStatus: 'PENDING',
        })

        expect(created).toMatchObject({
            customerAccountType: 'CREDIT',
            customerCategory: 'CORPORATE',
            paymentTerms: 'NET_30',
            creditStatus: 'PENDING',
        })
    })

    it.each([
        ['NON_CREDIT with credit limit', { customerAccountType: 'NON_CREDIT', creditLimit: 100 }],
        ['CREDIT without credit limit', { customerAccountType: 'CREDIT' }],
    ] as const)('rejects invalid account setup: %s', async (_label, overrides) => {
        const root = mockClient()
        await expect(
            makeService(root).create({ ...dto, ...overrides }),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(root.sdCustomer.create).not.toHaveBeenCalled()
    })

    it('auto-links nothing: shop login is created through E-Commerce registration, not SD Customer Master', async () => {
        const root = mockClient()
        const created = await makeService(root).create({ ...dto })

        expect(created).toMatchObject({
            customerAccountType: 'NON_CREDIT',
            customerCategory: 'RETAIL',
        })
        expect(root.sdCustomer.create).toHaveBeenCalledTimes(1)
    })

    it('stores birthDate on create', async () => {
        const root = mockClient()
        await makeService(root).create({ ...dto, birthDate: '1990-05-15' })
        expect(root.sdCustomer.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    birthDate: new Date('1990-05-15T00:00:00.000Z'),
                }),
            }),
        )
    })

    it('rejects a future birthDate on create', async () => {
        const root = mockClient()
        await expect(
            makeService(root).create({ ...dto, birthDate: '2999-01-01' }),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(root.sdCustomer.create).not.toHaveBeenCalled()
    })
})

describe('parseCustomerBirthDate', () => {
    it('accepts YYYY-MM-DD and null', () => {
        expect(parseCustomerBirthDate(null)).toBeNull()
        expect(parseCustomerBirthDate('2001-12-31')).toEqual(
            new Date('2001-12-31T00:00:00.000Z'),
        )
    })

    it('rejects future dates', () => {
        expect(() => parseCustomerBirthDate('2999-06-01')).toThrow(BadRequestException)
    })
})

describe('CustomerService.update birthDate', () => {
    function updateClient() {
        const current = {
            id: 'cust-1',
            creditLimit: new Decimal(0),
            availableCredit: new Decimal(0),
            customerAccountType: 'NON_CREDIT',
            email: 'ann@acme.test',
        }
        const client = {
            sdCustomer: {
                findUnique: jest.fn().mockResolvedValue(current),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
        }
        return { client, current }
    }

    it('sets and clears birthDate', async () => {
        const { client } = updateClient()
        const service = makeService(client as never)

        await service.update('cust-1', { birthDate: '1988-03-04' })
        expect(client.sdCustomer.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    birthDate: new Date('1988-03-04T00:00:00.000Z'),
                }),
            }),
        )

        await service.update('cust-1', { birthDate: null })
        expect(client.sdCustomer.updateMany).toHaveBeenLastCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ birthDate: null }),
            }),
        )
    })
})
