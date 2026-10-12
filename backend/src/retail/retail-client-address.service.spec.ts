import { NotFoundException } from '@nestjs/common'
import { RetailClientAddressService } from './retail-client-address.service'

const address = {
    id: 'address-1',
    addressType: 'HOME',
    formattedAddress: 'Sample street, Davao City',
    addressLine: 'Sample street',
    barangayOrNeighborhood: null,
    cityOrMunicipality: 'Davao City',
    provinceOrState: 'Davao del Sur',
    postalCode: '8000',
    country: 'Philippines',
    latitude: 7.0731,
    longitude: 125.6128,
    additionalInfo: null,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const input = {
    addressType: 'HOME' as const,
    latitude: 7.0731,
    longitude: 125.6128,
}

const setup = () => {
    const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'client-1' }]),
        retailClient: {
            update: jest.fn().mockResolvedValue({}),
        },
        retailClientAddress: {
            count: jest.fn().mockResolvedValue(0),
            updateMany: jest.fn(),
            create: jest.fn().mockResolvedValue(address),
            findFirst: jest.fn().mockResolvedValue(address),
            update: jest.fn().mockResolvedValue(address),
            delete: jest.fn(),
        },
    }
    const prisma = {
        $transaction: jest.fn((run) => run(tx)),
        retailClient: {
            findUnique: jest.fn().mockResolvedValue(null),
        },
        retailClientAddress: {
            findMany: jest.fn().mockResolvedValue([address]),
            findFirst: jest.fn().mockResolvedValue(address),
            create: jest.fn().mockResolvedValue(address),
        },
    }
    return {
        tx,
        prisma,
        service: new RetailClientAddressService(prisma as never),
    }
}

describe('RetailClientAddressService', () => {
    it('automatically makes a shopper’s first address the default', async () => {
        const { tx, service } = setup()

        await expect(service.create('client-1', input)).resolves.toEqual(address)
        expect(tx.$queryRaw).toHaveBeenCalled()
        expect(tx.retailClientAddress.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    clientId: 'client-1',
                    isDefault: true,
                    latitude: input.latitude,
                    longitude: input.longitude,
                }),
            }),
        )
    })

    it('uses both address and authenticated client id for ownership', async () => {
        const { prisma, service } = setup()
        await service.findOne('client-1', 'address-1')
        expect(prisma.retailClientAddress.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'address-1', clientId: 'client-1' } }),
        )

        prisma.retailClientAddress.findFirst.mockResolvedValueOnce(null)
        await expect(service.findOne('client-2', 'address-1')).rejects.toBeInstanceOf(
            NotFoundException,
        )
    })

    it('promotes another address when deleting the default', async () => {
        const { tx, service } = setup()
        tx.retailClientAddress.findFirst
            .mockResolvedValueOnce(address)
            .mockResolvedValueOnce({ id: 'address-2' })

        await service.remove('client-1', 'address-1')

        expect(tx.retailClientAddress.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'address-2' },
                data: { isDefault: true },
            }),
        )
    })

    it('auto-heals and creates default address from client profile address when address book is empty', async () => {
        const { prisma, service } = setup()
        prisma.retailClientAddress.findMany.mockResolvedValueOnce([])
        prisma.retailClient.findUnique.mockResolvedValueOnce({
            addressLine1: 'COR. INIGO ST. OBRERO',
            city: 'CITY OF DAVAO',
            region: 'DAVAO DEL SUR',
            postalCode: '8000',
            country: 'PH',
        })

        const result = await service.list('client-1')

        expect(prisma.retailClientAddress.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    clientId: 'client-1',
                    addressType: 'HOME',
                    isDefault: true,
                    addressLine: 'COR. INIGO ST. OBRERO',
                    cityOrMunicipality: 'CITY OF DAVAO',
                    provinceOrState: 'DAVAO DEL SUR',
                    postalCode: '8000',
                    country: 'PH',
                    latitude: 7.0731,
                    longitude: 125.6128,
                }),
            }),
        )
        expect(result).toEqual([address])
    })
})
