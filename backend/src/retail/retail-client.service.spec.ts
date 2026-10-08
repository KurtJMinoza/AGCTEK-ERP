import { BadRequestException, ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { RetailClientService } from './retail-client.service'

const input = {
    email: 'Shopper@Example.com',
    password: 'StrongPass1',
    firstName: 'Shopper',
}

const client = {
    id: 'client-1',
    email: 'shopper@example.com',
    fullName: input.firstName,
    phone: '',
    addressLine1: '',
    city: '',
    region: '',
    postalCode: '',
    country: 'PH',
}

const setup = () => {
    const prisma = {
        retailClient: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(client),
        },
    }
    const sessions = {
        issue: jest.fn().mockReturnValue({
            token: 'retail-session-token',
            expiresAt: '2026-10-14T00:00:00.000Z',
        }),
    }

    return {
        prisma,
        sessions,
        service: new RetailClientService(prisma as never, sessions as never),
    }
}

describe('RetailClientService registration', () => {
    it('normalizes the email and returns the newly issued shopper session', async () => {
        const { prisma, sessions, service } = setup()

        await expect(service.register(input)).resolves.toMatchObject({
            status: 'success',
            client: { customerId: client.id, email: client.email },
            token: 'retail-session-token',
        })

        expect(prisma.retailClient.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    email: client.email,
                    fullName: input.firstName,
                }),
            }),
        )
        expect(sessions.issue).toHaveBeenCalledWith(client.id)
    })

    it('enforces the password policy for non-HTTP callers too', async () => {
        const { prisma, service } = setup()

        await expect(
            service.register({ ...input, password: 'short' }),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(prisma.retailClient.findUnique).not.toHaveBeenCalled()
    })

    it('keeps a concurrent duplicate registration as a conflict', async () => {
        const { prisma, service } = setup()
        prisma.retailClient.create.mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError('duplicate email', {
                code: 'P2002',
                clientVersion: 'test',
            }),
        )

        await expect(service.register(input)).rejects.toBeInstanceOf(
            ConflictException,
        )
    })
})
