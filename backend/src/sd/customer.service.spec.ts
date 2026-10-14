import { BadRequestException, ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { PrismaService } from '../prisma/prisma.service'
import type { RetailClientService } from '../retail/retail-client.service'
import { CustomerService } from './customer.service'

const numberCollision = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['customerNumber'] },
    })

function mockClient() {
    const client = {
        retailClient: {
            findUnique: jest.fn().mockResolvedValue(null),
        },
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

function mockRetailClients() {
    return {
        createAccount: jest.fn().mockResolvedValue({ id: 'shop-new' }),
        requireAccount: jest.fn().mockResolvedValue({ id: 'shop-existing' }),
    }
}

const makeService = (root: ReturnType<typeof mockClient>, retail = mockRetailClients()) =>
    new CustomerService(
        root as unknown as PrismaService,
        retail as unknown as RetailClientService,
    )

const dto = { companyName: 'Acme', contactName: 'Ann', email: 'ann@acme.test', creditLimit: 0 }

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

    it('defaults to a B2B customer with no shop account', async () => {
        const root = mockClient()
        const created = await makeService(root).create({ ...dto, creditLimit: 5000 })

        expect(created).toMatchObject({ customerType: 'B2B', retailClientId: undefined })
        expect(root.$transaction).not.toHaveBeenCalled()
    })

    it('creates the shop login and RETAIL customer in one transaction', async () => {
        const root = mockClient()
        const retail = mockRetailClients()

        const created = await makeService(root, retail).create({
            ...dto,
            customerType: 'RETAIL',
            password: 'secret123',
        })

        expect(root.$transaction).toHaveBeenCalledTimes(1)
        expect(retail.createAccount).toHaveBeenCalledWith(
            expect.objectContaining({ email: dto.email, password: 'secret123', fullName: 'Ann' }),
            root,
        )
        expect(created).toMatchObject({ customerType: 'RETAIL', retailClientId: 'shop-new' })
    })

    it('links an existing shop account to a RETAIL customer', async () => {
        const root = mockClient()
        const retail = mockRetailClients()

        const created = await makeService(root, retail).create({
            ...dto,
            customerType: 'RETAIL',
            retailClientId: 'shop-existing',
        })

        expect(retail.requireAccount).toHaveBeenCalledWith('shop-existing', root)
        expect(retail.createAccount).not.toHaveBeenCalled()
        expect(created).toMatchObject({ retailClientId: 'shop-existing' })
    })

    it.each([
        ['neither shop option', { customerType: 'RETAIL' as const }],
        [
            'both shop options',
            { customerType: 'RETAIL' as const, retailClientId: 'x', password: 'secret123' },
        ],
        [
            'a credit limit',
            { customerType: 'RETAIL' as const, retailClientId: 'x', creditLimit: 100 },
        ],
        ['a shop account on B2B', { customerType: 'B2B' as const, retailClientId: 'x' }],
    ])('rejects a RETAIL/B2B mismatch: %s', async (_label, overrides) => {
        const root = mockClient()
        await expect(makeService(root).create({ ...dto, ...overrides })).rejects.toBeInstanceOf(
            BadRequestException,
        )
        expect(root.sdCustomer.create).not.toHaveBeenCalled()
    })

    it('auto-links a shop account that already uses the customer email', async () => {
        const root = mockClient()
        root.retailClient.findUnique.mockResolvedValue({ id: 'shop-by-email' })

        const created = await makeService(root).create({ ...dto, customerType: 'RETAIL' })

        expect(created).toMatchObject({ customerType: 'RETAIL', retailClientId: 'shop-by-email' })
    })

    it('does not create the customer when the new shop login is rejected', async () => {
        const root = mockClient()
        const retail = mockRetailClients()
        retail.createAccount.mockRejectedValue(
            new ConflictException('An account with this email already exists.'),
        )

        await expect(
            makeService(root, retail).create({
                ...dto,
                customerType: 'RETAIL',
                password: 'shopPass123',
            }),
        ).rejects.toThrow(ConflictException)
        expect(root.sdCustomer.create).not.toHaveBeenCalled()
    })
})
