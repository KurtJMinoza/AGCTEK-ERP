import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import type {
    RetailCartItemDto,
    RetailLoginDto,
    RetailRegisterDto,
    RetailUpdateProfileDto,
} from './dto/retail-client.dto'
import { RetailSessionService } from './retail-session.service'
import {
    MAX_CUSTOMER_NUMBER_ATTEMPTS,
    nextCustomerNumber,
} from '../sd/customer-number'

/** Compared against for unknown emails so sign-in timing does not reveal which accounts exist. */
const UNKNOWN_ACCOUNT_HASH = bcrypt.hashSync('unknown-account', 10)
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 72

type DefaultAddress = {
    formattedAddress: string | null
    addressLine: string | null
    cityOrMunicipality: string | null
    provinceOrState: string | null
    postalCode: string | null
    country: string | null
    additionalInfo: string | null
    latitude: number
    longitude: number
}

const hasValidPassword = (password: string) =>
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)

@Injectable()
export class RetailClientService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly sessions: RetailSessionService,
    ) {}

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
        addresses?: DefaultAddress[]
    }) {
        const defaultAddress = client.addresses?.[0]
        // A pin-only address (reverse geocode found no text) is still a valid
        // delivery point: label it with the exact coordinates instead of
        // pretending the account has no address at all.
        const pinnedLabel = defaultAddress
            ? `Pinned location (${defaultAddress.latitude.toFixed(5)}, ${defaultAddress.longitude.toFixed(5)})`
            : null
        const addressLine1 = defaultAddress
            ? [defaultAddress.addressLine, defaultAddress.additionalInfo]
                  .filter(Boolean)
                  .join(', ') ||
              defaultAddress.formattedAddress ||
              pinnedLabel ||
              client.addressLine1
            : client.addressLine1
        return {
            customerId: client.id,
            email: client.email,
            firstName: client.fullName,
            // Retained for checkout payload compatibility while shopper accounts
            // now collect a first name only at registration.
            fullName: client.fullName,
            phone: client.phone,
            addressLine1,
            city: defaultAddress?.cityOrMunicipality ?? client.city,
            region: defaultAddress?.provinceOrState ?? client.region,
            postalCode: defaultAddress?.postalCode ?? client.postalCode,
            country: defaultAddress?.country ?? client.country,
        }
    }

    /**
     * Shared by shopper self-registration and SD Customer Master (staff creating a
     * shop login for a RETAIL customer). `client` lets the caller include the
     * account in its own transaction.
     */
    async createAccount(
        input: { email: string; password: string; fullName?: string; phone?: string },
        client: PrismaService | Prisma.TransactionClient = this.prisma,
    ) {
        const email = input.email.trim().toLowerCase()
        const password = input.password

        // Keep service callers subject to the same policy as HTTP DTO validation.
        // The service is also used by tests and future trusted integrations.
        if (!hasValidPassword(password)) {
            throw new BadRequestException(
                'Password must be 8–72 characters and include at least one letter and one number.',
            )
        }

        const existing = await client.retailClient.findUnique({
            where: { email },
        })
        if (existing) {
            throw new ConflictException(
                'An account with this email already exists.',
            )
        }

        const passwordHash = await bcrypt.hash(password, 10)
        try {
            return await client.retailClient.create({
                data: {
                    email,
                    passwordHash,
                    fullName: (input.fullName || 'Valued Customer').trim(),
                    phone: input.phone?.trim() ?? '',
                },
            })
        } catch (error) {
            // The pre-flight read is for a clear common-case message; the unique
            // constraint remains the authority under concurrent sign-up requests.
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException(
                    'An account with this email already exists.',
                )
            }
            throw error
        }
    }

    async requireAccount(
        id: string,
        client: PrismaService | Prisma.TransactionClient = this.prisma,
    ) {
        const account = await client.retailClient.findUnique({
            where: { id: id.trim() },
            select: { id: true, email: true, fullName: true },
        })
        if (!account) {
            throw new NotFoundException('Shop account not found.')
        }
        return account
    }

    async register(input: RetailRegisterDto) {
        const client = await this.createAccount({
            email: input.email,
            password: input.password,
            fullName: input.firstName || input.fullName,
        })

        // Connect the new shop account to the SD Customer Master: link when an SD
// customer already uses this email, otherwise auto-create the customer
// record so the account is reflected in the Customer Master module.
try {
    const customer = await this.prisma.sdCustomer.findUnique({
        where: { email: client.email },
        select: { id: true, retailClientId: true },
    })
    if (customer) {
        if (!customer.retailClientId) {
            await this.prisma.sdCustomer.update({
                where: { id: customer.id },
                data: { retailClientId: client.id },
            })
        }
    } else {
        await this.createCustomerFromShopAccount(client)
    }
} catch {
    // Best effort — the link can always be made from the SD customer master.
}

return {
    status: 'success',
    message: 'Account created.',
    client: this.toPublic(client),
    ...this.sessions.issue(client.id),
}
}

/**
 * Auto-creates the SD Customer Master record for a new shop account
 * (customerNumber retry on collision; email conflict links instead).
 */
private async createCustomerFromShopAccount(client: {
    id: string
    email: string
    fullName: string
    phone: string
}) {
    for (let attempt = 0; attempt < MAX_CUSTOMER_NUMBER_ATTEMPTS; attempt++) {
        const customerNumber = await nextCustomerNumber(attempt, this.prisma)
        try {
            await this.prisma.sdCustomer.create({
                data: {
                    customerNumber,
                    companyName: client.fullName,
                    contactName: client.fullName,
                    email: client.email,
                    phone: client.phone,
                    creditLimit: new Decimal(0),
                    availableCredit: new Decimal(0),
                    status: 'ACTIVE',
                    customerType: 'RETAIL',
                    retailClientId: client.id,
                },
            })
            return
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const target = error.meta?.target
                const targets = Array.isArray(target)
                    ? target.map(String)
                    : [String(target)]
                if (targets.includes('email')) {
                    // Created concurrently — link the existing record instead.
                    await this.prisma.sdCustomer.updateMany({
                        where: { email: client.email },
                        data: { retailClientId: client.id },
                    })
                    return
                }
                if (targets.includes('customerNumber')) continue
            }
            throw error
        }
    }
}

    async login(input: RetailLoginDto) {
        const email = input.email.trim().toLowerCase()
        const client = await this.prisma.retailClient.findUnique({
            where: { email },
            include: {
                addresses: {
                    where: { isDefault: true },
                    take: 1,
                    select: {
                        formattedAddress: true,
                        addressLine: true,
                        cityOrMunicipality: true,
                        provinceOrState: true,
                        postalCode: true,
                        country: true,
                        additionalInfo: true,
                        latitude: true,
                        longitude: true,
                    },
                },
            },
        })
        const valid = await bcrypt.compare(
            input.password,
            client?.passwordHash ?? UNKNOWN_ACCOUNT_HASH,
        )
        if (!client || !valid) {
            throw new UnauthorizedException('Invalid email or password.')
        }

        return {
            status: 'success',
            client: this.toPublic(client),
            ...this.sessions.issue(client.id),
        }
    }

    async getProfile(clientId: string) {
        const client = await this.prisma.retailClient.findUnique({
            where: { id: clientId.trim() },
            include: {
                addresses: {
                    where: { isDefault: true },
                    take: 1,
                    select: {
                        formattedAddress: true,
                        addressLine: true,
                        cityOrMunicipality: true,
                        provinceOrState: true,
                        postalCode: true,
                        country: true,
                        additionalInfo: true,
                        latitude: true,
                        longitude: true,
                    },
                },
            },
        })
        if (!client) {
            throw new NotFoundException('Client not found.')
        }
        return this.toPublic(client)
    }

    async updateProfile(clientId: string, input: RetailUpdateProfileDto) {
        const existing = await this.prisma.retailClient.findUnique({
            where: { id: clientId },
        })
        if (!existing) {
            throw new NotFoundException('Client not found.')
        }

        const client = await this.prisma.retailClient.update({
            where: { id: clientId },
            data: {
                ...(input.firstName !== undefined && {
                    fullName: input.firstName.trim(),
                }),
                ...(input.phone !== undefined && { phone: input.phone.trim() }),
            },
            include: {
                addresses: {
                    where: { isDefault: true },
                    take: 1,
                    select: {
                        formattedAddress: true,
                        addressLine: true,
                        cityOrMunicipality: true,
                        provinceOrState: true,
                        postalCode: true,
                        country: true,
                        additionalInfo: true,
                        latitude: true,
                        longitude: true,
                    },
                },
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
}
