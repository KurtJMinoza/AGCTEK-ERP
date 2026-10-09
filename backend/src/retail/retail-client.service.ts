import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type {
    RetailAddressDto,
    RetailCartItemDto,
    RetailLoginDto,
    RetailRegisterDto,
    RetailUpdateAddressDto,
    RetailUpdateProfileDto,
} from './dto/retail-client.dto'

@Injectable()
export class RetailClientService {
    constructor(private readonly prisma: PrismaService) {}

    private toPublic(client: {
        id: string
        email: string
        fullName: string
        phone: string
        addressLine1: string
        city: string
        region: string
        postalCode: string
        country: string
    }) {
        return {
            customerId: client.id,
            email: client.email,
            fullName: client.fullName,
            phone: client.phone,
            addressLine1: client.addressLine1,
            city: client.city,
            region: client.region,
            postalCode: client.postalCode,
            country: client.country,
        }
    }

    async register(input: RetailRegisterDto) {
        const email = input.email.trim().toLowerCase()
        const password = input.password

        if (password.length < 6) {
            throw new BadRequestException(
                'Password must be at least 6 characters.',
            )
        }

        const existing = await this.prisma.retailClient.findUnique({
            where: { email },
        })
        if (existing) {
            throw new ConflictException(
                'An account with this email already exists.',
            )
        }

        const passwordHash = await bcrypt.hash(password, 10)
        const client = await this.prisma.$transaction(async (tx) => {
            const created = await tx.retailClient.create({
                data: {
                    email,
                    passwordHash,
                    fullName: input.fullName.trim(),
                    phone: input.phone.trim(),
                    addressLine1: input.addressLine1.trim(),
                    city: input.city.trim(),
                    region: input.region.trim(),
                    postalCode: input.postalCode.trim(),
                    country: (input.country || 'PH').trim() || 'PH',
                },
            })
            // The very first saved address becomes the checkout default.
            await tx.retailClientAddress.create({
                data: {
                    retailClientId: created.id,
                    fullName: input.fullName.trim(),
                    phone: input.phone.trim(),
                    addressLine1: input.addressLine1.trim(),
                    city: input.city.trim(),
                    region: input.region.trim(),
                    postalCode: input.postalCode.trim(),
                    country: (input.country || 'PH').trim() || 'PH',
                    isDefault: true,
                },
            })
            return created
        })

        return {
            status: 'success',
            message: 'Account created.',
            client: this.toPublic(client),
        }
    }

    async login(input: RetailLoginDto) {
        const email = input.email.trim().toLowerCase()
        const client = await this.prisma.retailClient.findUnique({
            where: { email },
        })
        if (!client) {
            throw new UnauthorizedException('Invalid email or password.')
        }

        const valid = await bcrypt.compare(input.password, client.passwordHash)
        if (!valid) {
            throw new UnauthorizedException('Invalid email or password.')
        }

        return {
            status: 'success',
            client: this.toPublic(client),
        }
    }

    async getProfile(clientId: string) {
        const client = await this.prisma.retailClient.findUnique({
            where: { id: clientId.trim() },
        })
        if (!client) {
            throw new NotFoundException('Client not found.')
        }
        return this.toPublic(client)
    }

    async updateProfile(input: RetailUpdateProfileDto) {
        const clientId = input.clientId.trim()
        const existing = await this.prisma.retailClient.findUnique({
            where: { id: clientId },
        })
        if (!existing) {
            throw new NotFoundException('Client not found.')
        }

        const client = await this.prisma.retailClient.update({
            where: { id: clientId },
            data: {
                ...(input.fullName !== undefined && {
                    fullName: input.fullName.trim(),
                }),
                ...(input.phone !== undefined && { phone: input.phone.trim() }),
                ...(input.addressLine1 !== undefined && {
                    addressLine1: input.addressLine1.trim(),
                }),
                ...(input.city !== undefined && { city: input.city.trim() }),
                ...(input.region !== undefined && {
                    region: input.region.trim(),
                }),
                ...(input.postalCode !== undefined && {
                    postalCode: input.postalCode.trim(),
                }),
                ...(input.country !== undefined && {
                    country: input.country.trim() || 'PH',
                }),
            },
        })

        return {
            status: 'success',
            client: this.toPublic(client),
        }
    }

    async getCart(clientId: string) {
        const client = await this.prisma.retailClient.findUnique({
            where: { id: clientId.trim() },
            select: { id: true },
        })
        if (!client) {
            throw new NotFoundException('Client not found.')
        }

        const items = await this.prisma.retailCartItem.findMany({
            where: { clientId: client.id },
            orderBy: { createdAt: 'asc' },
        })

        return {
            items: items.map((item) => ({
                sku: item.sku,
                quantity: item.quantity,
                product: item.product,
            })),
        }
    }

    async replaceCart(clientId: string, items: RetailCartItemDto[]) {
        const id = clientId.trim()
        const client = await this.prisma.retailClient.findUnique({
            where: { id },
            select: { id: true },
        })
        if (!client) {
            throw new NotFoundException('Client not found.')
        }

        const normalized = items
            .filter((item) => item.sku?.trim() && item.quantity >= 1)
            .map((item) => ({
                sku: item.sku.trim(),
                quantity: Math.max(1, Math.floor(item.quantity)),
                product: item.product as Prisma.InputJsonValue,
            }))

        await this.prisma.$transaction(async (tx) => {
            await tx.retailCartItem.deleteMany({ where: { clientId: id } })
            if (normalized.length === 0) return
            await tx.retailCartItem.createMany({
                data: normalized.map((item) => ({
                    clientId: id,
                    sku: item.sku,
                    quantity: item.quantity,
                    product: item.product,
                })),
            })
        })

        return this.getCart(id)
    }

    // ── Multi-address book ─────────────────────────────────────────────────

    private toAddress(address: {
        id: string
        label: string | null
        fullName: string
        phone: string
        addressLine1: string
        city: string
        region: string
        postalCode: string
        country: string
        isDefault: boolean
        createdAt: Date
        updatedAt: Date
    }) {
        return {
            id: address.id,
            label: address.label ?? null,
            fullName: address.fullName,
            phone: address.phone,
            addressLine1: address.addressLine1,
            city: address.city,
            region: address.region,
            postalCode: address.postalCode,
            country: address.country,
            isDefault: address.isDefault,
            createdAt: address.createdAt,
            updatedAt: address.updatedAt,
        }
    }

    private async assertClientExists(clientId: string) {
        const client = await this.prisma.retailClient.findUnique({
            where: { id: clientId.trim() },
            select: { id: true },
        })
        if (!client) {
            throw new NotFoundException('Client not found.')
        }
        return client.id
    }

    private async findOwnedAddress(addressId: string) {
        const address = await this.prisma.retailClientAddress.findUnique({
            where: { id: addressId.trim() },
        })
        if (!address) {
            throw new NotFoundException('Address not found.')
        }
        return address
    }

    async listAddresses(clientId: string) {
        const id = await this.assertClientExists(clientId)
        const addresses = await this.prisma.retailClientAddress.findMany({
            where: { retailClientId: id },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        })
        return { addresses: addresses.map((a) => this.toAddress(a)) }
    }

    async createAddress(clientId: string, input: RetailAddressDto) {
        const id = await this.assertClientExists(clientId)
        const count = await this.prisma.retailClientAddress.count({
            where: { retailClientId: id },
        })
        const address = await this.prisma.retailClientAddress.create({
            data: {
                retailClientId: id,
                label: input.label?.trim() || null,
                fullName: input.fullName.trim(),
                phone: input.phone.trim(),
                addressLine1: input.addressLine1.trim(),
                city: input.city.trim(),
                region: input.region.trim(),
                postalCode: input.postalCode.trim(),
                country: (input.country || 'PH').trim() || 'PH',
                // Safety condition: an account's first address is the default.
                isDefault: count === 0,
            },
        })
        return { address: this.toAddress(address) }
    }

    async updateAddress(addressId: string, input: RetailUpdateAddressDto) {
        const existing = await this.findOwnedAddress(addressId)
        const address = await this.prisma.retailClientAddress.update({
            where: { id: existing.id },
            data: {
                ...(input.label !== undefined && {
                    label: input.label?.trim() || null,
                }),
                ...(input.fullName !== undefined && {
                    fullName: input.fullName.trim(),
                }),
                ...(input.phone !== undefined && {
                    phone: input.phone.trim(),
                }),
                ...(input.addressLine1 !== undefined && {
                    addressLine1: input.addressLine1.trim(),
                }),
                ...(input.city !== undefined && {
                    city: input.city.trim(),
                }),
                ...(input.region !== undefined && {
                    region: input.region.trim(),
                }),
                ...(input.postalCode !== undefined && {
                    postalCode: input.postalCode.trim(),
                }),
                ...(input.country !== undefined && {
                    country: input.country.trim() || 'PH',
                }),
            },
        })
        return { address: this.toAddress(address) }
    }

    /**
     * Default switch: atomically clear every other address for the customer,
     * then promote this one. Never leaves two defaults behind.
     */
    async setDefaultAddress(addressId: string) {
        const existing = await this.findOwnedAddress(addressId)
        if (existing.isDefault) {
            return { address: this.toAddress(existing) }
        }
        const address = await this.prisma.$transaction(async (tx) => {
            await tx.retailClientAddress.updateMany({
                where: {
                    retailClientId: existing.retailClientId,
                    isDefault: true,
                },
                data: { isDefault: false },
            })
            return tx.retailClientAddress.update({
                where: { id: existing.id },
                data: { isDefault: true },
            })
        })
        return { address: this.toAddress(address) }
    }

    async deleteAddress(addressId: string) {
        const existing = await this.findOwnedAddress(addressId)
        if (existing.isDefault) {
            const others = await this.prisma.retailClientAddress.count({
                where: {
                    retailClientId: existing.retailClientId,
                    NOT: { id: existing.id },
                },
            })
            if (others > 0) {
                // Safety condition: never leave the account without a default
                // when alternatives exist — set one first, then delete.
                throw new ConflictException(
                    'Set another address as your default before deleting this one.',
                )
            }
        }
        await this.prisma.retailClientAddress.delete({
            where: { id: existing.id },
        })
        return { deleted: true }
    }
}
