import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type {
    RetailAddressUpsertDto,
    RetailUpdateAddressDto,
} from './dto/retail-address.dto'

const ADDRESS_SELECT = {
    id: true,
    addressType: true,
    formattedAddress: true,
    addressLine: true,
    barangayOrNeighborhood: true,
    cityOrMunicipality: true,
    provinceOrState: true,
    postalCode: true,
    country: true,
    latitude: true,
    longitude: true,
    additionalInfo: true,
    isDefault: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.RetailClientAddressSelect

type Tx = Prisma.TransactionClient
type AddressInput = RetailAddressUpsertDto | RetailUpdateAddressDto

const nullableText = (value: string | undefined) => {
    const normalized = value?.trim()
    return normalized ? normalized : null
}

const addressData = (input: AddressInput) => ({
    ...(input.addressType !== undefined && { addressType: input.addressType }),
    ...(input.formattedAddress !== undefined && {
        formattedAddress: nullableText(input.formattedAddress),
    }),
    ...(input.addressLine !== undefined && {
        addressLine: nullableText(input.addressLine),
    }),
    ...(input.barangayOrNeighborhood !== undefined && {
        barangayOrNeighborhood: nullableText(input.barangayOrNeighborhood),
    }),
    ...(input.cityOrMunicipality !== undefined && {
        cityOrMunicipality: nullableText(input.cityOrMunicipality),
    }),
    ...(input.provinceOrState !== undefined && {
        provinceOrState: nullableText(input.provinceOrState),
    }),
    ...(input.postalCode !== undefined && {
        postalCode: nullableText(input.postalCode),
    }),
    ...(input.country !== undefined && {
        country: nullableText(input.country),
    }),
    ...(input.latitude !== undefined && { latitude: input.latitude }),
    ...(input.longitude !== undefined && { longitude: input.longitude }),
    ...(input.additionalInfo !== undefined && {
        additionalInfo: nullableText(input.additionalInfo),
    }),
})

/**
 * Shopper address ownership and default-address invariants.
 * The retail client row is locked for mutations so first/default promotion is
 * serialized per shopper; the migration also enforces one default in Postgres.
 */
@Injectable()
export class RetailClientAddressService {
    constructor(private readonly prisma: PrismaService) {}

    async list(clientId: string) {
        return this.prisma.retailClientAddress.findMany({
            where: { clientId },
            select: ADDRESS_SELECT,
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        })
    }

    async findOne(clientId: string, addressId: string) {
        return this.findOwnedOrThrow(this.prisma, clientId, addressId)
    }

    async create(clientId: string, input: RetailAddressUpsertDto) {
        return this.prisma.$transaction(async (tx) => {
            await this.lockClient(tx, clientId)
            const total = await tx.retailClientAddress.count({
                where: { clientId },
            })
            const makeDefault = total === 0 || input.isDefault === true
            if (makeDefault) {
                await tx.retailClientAddress.updateMany({
                    where: { clientId, isDefault: true },
                    data: { isDefault: false },
                })
            }
            return tx.retailClientAddress.create({
                data: {
                    clientId,
                    addressType: input.addressType,
                    latitude: input.latitude,
                    longitude: input.longitude,
                    isDefault: makeDefault,
                    ...addressData(input),
                },
                select: ADDRESS_SELECT,
            })
        })
    }

    async update(
        clientId: string,
        addressId: string,
        input: RetailUpdateAddressDto,
    ) {
        return this.prisma.$transaction(async (tx) => {
            await this.lockClient(tx, clientId)
            const address = await this.findOwnedOrThrow(tx, clientId, addressId)
            if (input.isDefault === true && !address.isDefault) {
                await tx.retailClientAddress.updateMany({
                    where: {
                        clientId,
                        isDefault: true,
                        NOT: { id: address.id },
                    },
                    data: { isDefault: false },
                })
            }
            // A default cannot be unset through edit: use another address as
            // the default, or delete it (which promotes the oldest remaining).
            return tx.retailClientAddress.update({
                where: { id: address.id },
                data: {
                    ...addressData(input),
                    ...(input.isDefault === true && { isDefault: true }),
                },
                select: ADDRESS_SELECT,
            })
        })
    }

    async remove(clientId: string, addressId: string) {
        return this.prisma.$transaction(async (tx) => {
            await this.lockClient(tx, clientId)
            const address = await this.findOwnedOrThrow(tx, clientId, addressId)
            await tx.retailClientAddress.delete({ where: { id: address.id } })

            if (address.isDefault) {
                const replacement = await tx.retailClientAddress.findFirst({
                    where: { clientId },
                    select: { id: true },
                    orderBy: { createdAt: 'asc' },
                })
                if (replacement) {
                    await tx.retailClientAddress.update({
                        where: { id: replacement.id },
                        data: { isDefault: true },
                    })
                }
            }
        })
    }

    async setDefault(clientId: string, addressId: string) {
        return this.prisma.$transaction(async (tx) => {
            await this.lockClient(tx, clientId)
            const address = await this.findOwnedOrThrow(tx, clientId, addressId)
            await tx.retailClientAddress.updateMany({
                where: { clientId, isDefault: true, NOT: { id: address.id } },
                data: { isDefault: false },
            })
            return tx.retailClientAddress.update({
                where: { id: address.id },
                data: { isDefault: true },
                select: ADDRESS_SELECT,
            })
        })
    }

    private async findOwnedOrThrow(
        client: PrismaService | Tx,
        clientId: string,
        addressId: string,
    ) {
        const address = await client.retailClientAddress.findFirst({
            where: { id: addressId, clientId },
            select: ADDRESS_SELECT,
        })
        if (!address) throw new NotFoundException('Address not found.')
        return address
    }

    private async lockClient(tx: Tx, clientId: string) {
        const rows = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "RetailClient" WHERE "id" = ${clientId} FOR UPDATE
        `
        if (rows.length === 0) throw new NotFoundException('Client not found.')
    }
}
