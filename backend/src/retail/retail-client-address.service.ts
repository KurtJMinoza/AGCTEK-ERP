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
        const addresses = await this.prisma.retailClientAddress.findMany({
            where: { clientId },
            select: ADDRESS_SELECT,
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        })
        if (addresses.length > 0) {
            return addresses
        }

        // Auto-heal / sync from RetailClient profile address if client has one saved
        const client = await this.prisma.retailClient.findUnique({
            where: { id: clientId },
            select: {
                addressLine1: true,
                city: true,
                region: true,
                postalCode: true,
                country: true,
            },
        })

        const hasProfileAddress =
            Boolean(client?.addressLine1?.trim()) ||
            Boolean(client?.city?.trim()) ||
            Boolean(client?.region?.trim())

        if (client && hasProfileAddress) {
            const formatted = [
                client.addressLine1?.trim(),
                client.city?.trim(),
                client.region?.trim(),
                client.postalCode?.trim(),
                client.country?.trim() || 'PH',
            ]
                .filter(Boolean)
                .join(', ')

            const coords = this.resolveCoordinates(client.city, client.region)

            try {
                const created = await this.prisma.retailClientAddress.create({
                    data: {
                        clientId,
                        addressType: 'HOME',
                        formattedAddress: formatted || null,
                        addressLine: client.addressLine1?.trim() || null,
                        cityOrMunicipality: client.city?.trim() || null,
                        provinceOrState: client.region?.trim() || null,
                        postalCode: client.postalCode?.trim() || null,
                        country: client.country?.trim() || 'PH',
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                        isDefault: true,
                    },
                    select: ADDRESS_SELECT,
                })
                return [created]
            } catch {
                return this.prisma.retailClientAddress.findMany({
                    where: { clientId },
                    select: ADDRESS_SELECT,
                    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
                })
            }
        }

        return []
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
            const created = await tx.retailClientAddress.create({
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
            if (makeDefault) {
                await this.syncProfileDefaultAddress(tx, clientId, {
                    addressLine: input.addressLine,
                    formattedAddress: input.formattedAddress,
                    cityOrMunicipality: input.cityOrMunicipality,
                    provinceOrState: input.provinceOrState,
                    postalCode: input.postalCode,
                    country: input.country,
                })
            }
            return created
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
            const updated = await tx.retailClientAddress.update({
                where: { id: address.id },
                data: {
                    ...addressData(input),
                    ...(input.isDefault === true && { isDefault: true }),
                },
                select: ADDRESS_SELECT,
            })
            if (input.isDefault === true || address.isDefault) {
                await this.syncProfileDefaultAddress(tx, clientId, {
                    addressLine: updated.addressLine,
                    formattedAddress: updated.formattedAddress,
                    cityOrMunicipality: updated.cityOrMunicipality,
                    provinceOrState: updated.provinceOrState,
                    postalCode: updated.postalCode,
                    country: updated.country,
                })
            }
            return updated
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
                    const nextDefault = await tx.retailClientAddress.update({
                        where: { id: replacement.id },
                        data: { isDefault: true },
                        select: ADDRESS_SELECT,
                    })
                    await this.syncProfileDefaultAddress(tx, clientId, {
                        addressLine: nextDefault.addressLine,
                        formattedAddress: nextDefault.formattedAddress,
                        cityOrMunicipality: nextDefault.cityOrMunicipality,
                        provinceOrState: nextDefault.provinceOrState,
                        postalCode: nextDefault.postalCode,
                        country: nextDefault.country,
                    })
                } else {
                    await tx.retailClient.update({
                        where: { id: clientId },
                        data: {
                            addressLine1: '',
                            city: '',
                            region: '',
                            postalCode: '',
                        },
                    }).catch(() => {})
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
            const updated = await tx.retailClientAddress.update({
                where: { id: address.id },
                data: { isDefault: true },
                select: ADDRESS_SELECT,
            })
            await this.syncProfileDefaultAddress(tx, clientId, {
                addressLine: updated.addressLine,
                formattedAddress: updated.formattedAddress,
                cityOrMunicipality: updated.cityOrMunicipality,
                provinceOrState: updated.provinceOrState,
                postalCode: updated.postalCode,
                country: updated.country,
            })
            return updated
        })
    }

    private resolveCoordinates(city?: string | null, region?: string | null) {
        const text = `${city ?? ''} ${region ?? ''}`.toLowerCase()
        if (text.includes('davao')) return { latitude: 7.0731, longitude: 125.6128 }
        if (text.includes('cebu')) return { latitude: 10.3157, longitude: 123.8854 }
        if (text.includes('cagayan de oro') || text.includes('cdo'))
            return { latitude: 8.4542, longitude: 124.6319 }
        if (text.includes('iloilo')) return { latitude: 10.7202, longitude: 122.5621 }
        if (text.includes('baguio')) return { latitude: 16.4023, longitude: 120.596 }
        if (text.includes('zamboanga')) return { latitude: 6.9214, longitude: 122.079 }
        if (text.includes('general santos') || text.includes('gensan'))
            return { latitude: 6.1164, longitude: 125.1716 }
        return { latitude: 14.5995, longitude: 120.9842 }
    }

    private async syncProfileDefaultAddress(
        tx: Tx,
        clientId: string,
        data: {
            addressLine?: string | null
            formattedAddress?: string | null
            cityOrMunicipality?: string | null
            provinceOrState?: string | null
            postalCode?: string | null
            country?: string | null
        },
    ) {
        const addressLine1 =
            data.addressLine?.trim() || data.formattedAddress?.trim() || ''
        await tx.retailClient.update({
            where: { id: clientId },
            data: {
                addressLine1,
                city: data.cityOrMunicipality?.trim() ?? '',
                region: data.provinceOrState?.trim() ?? '',
                postalCode: data.postalCode?.trim() ?? '',
                country: data.country?.trim() || 'PH',
            },
        }).catch(() => {})
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
