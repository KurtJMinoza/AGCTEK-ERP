import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import {
    CreateCustomerDto,
    ListCustomersQueryDto,
    UpdateCustomerDto,
} from './dto/customer.dto'
import {
    MAX_CUSTOMER_NUMBER_ATTEMPTS,
    nextCustomerNumber as nextCustomerNumberShared,
} from './customer-number'

const MAX_CREATE_ATTEMPTS = MAX_CUSTOMER_NUMBER_ATTEMPTS

@Injectable()
export class CustomerService {
    constructor(private prisma: PrismaService) {}

    list(query: ListCustomersQueryDto) {
        const search = query.search?.trim()
        const where: Prisma.SdCustomerWhereInput = {
            ...(query.status ? { status: query.status } : {}),
            ...(search
                ? {
                      OR: [
                          { customerNumber: { contains: search, mode: 'insensitive' } },
                          { companyName: { contains: search, mode: 'insensitive' } },
                          { contactName: { contains: search, mode: 'insensitive' } },
                          { email: { contains: search, mode: 'insensitive' } },
                      ],
                  }
                : {}),
        }
        return this.prisma.sdCustomer.findMany({
            where,
            include: {
                retailClient: { select: { email: true, fullName: true } },
            },
            orderBy: { companyName: 'asc' },
        })
    }

    findOne(id: string) {
        return this.findOneRow(id)
    }

    /**
     * Shop (storefront) accounts for the Add New Customer reference picker:
     * profile + default address, with the linked SD customer when present.
     */
    async listShopAccounts() {
        const clients = await this.prisma.retailClient.findMany({
            include: {
                addresses: {
                    where: { isDefault: true },
                    take: 1,
                    select: {
                        addressLine: true,
                        cityOrMunicipality: true,
                        provinceOrState: true,
                        postalCode: true,
                    },
                },
                sdCustomer: {
                    select: {
                        id: true,
                        customerNumber: true,
                        companyName: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        })
        return clients.map((c) => ({
            id: c.id,
            email: c.email,
            fullName: c.fullName,
            phone: c.phone,
            addressLabel: c.addresses[0]
                ? [
                      c.addresses[0].addressLine,
                      c.addresses[0].cityOrMunicipality,
                      c.addresses[0].provinceOrState,
                  ]
                      .filter(Boolean)
                      .join(', ')
                : null,
            linkedCustomer: c.sdCustomer ?? null,
        }))
    }

    private async findOneRow(id: string) {
        const row = await this.prisma.sdCustomer.findUnique({ where: { id } })
        if (!row) throw new NotFoundException('Customer not found')
        return row
    }

    /**
     * `client` lets another module's workflow (e.g. CRM lead conversion) create the customer
     * inside its own transaction. A failed statement aborts a Postgres transaction, so
     * number-collision retries only run on the root client.
     */
    async create(
        dto: CreateCustomerDto,
        client: PrismaService | Prisma.TransactionClient = this.prisma,
    ) {
        const attempts = client === this.prisma ? MAX_CREATE_ATTEMPTS : 1
        // Link the referenced shop account, auto-link by email, or provision a
        // brand-new shop login from the supplied password (Add ↔ Shop).
        let retailClientId: string | undefined = dto.retailClientId ?? undefined
        if (retailClientId) {
            const shopAccount = await client.retailClient.findUnique({
                where: { id: retailClientId },
                select: { id: true },
            })
            if (!shopAccount) {
                throw new NotFoundException(
                    'The referenced shop account was not found',
                )
            }
        } else if (dto.password) {
            const byEmail = await client.retailClient.findUnique({
                where: { email: dto.email },
                select: { id: true },
            })
            if (byEmail) {
                throw new ConflictException(
                    'A Shop account already exists for this email — reference it instead of entering a password',
                )
            }
        } else {
            const byEmail = await client.retailClient.findUnique({
                where: { email: dto.email },
                select: { id: true },
            })
            if (byEmail) retailClientId = byEmail.id
        }
        let customer
        for (let attempt = 0; attempt < attempts; attempt++) {
            const customerNumber = await this.nextCustomerNumber(attempt, client)
            try {
                customer = await client.sdCustomer.create({
                    data: {
                        customerNumber,
                        companyName: dto.companyName,
                        contactName: dto.contactName,
                        email: dto.email,
                        phone: dto.phone ?? '',
                        creditLimit: new Decimal(dto.creditLimit ?? 0),
                        availableCredit: new Decimal(dto.creditLimit ?? 0),
                        status: dto.status ?? 'ACTIVE',
                        retailClientId,
                        createdBy: dto.createdBy,
                        updatedBy: dto.createdBy,
                    },
                })
                break
            } catch (error) {
                const target = this.uniqueViolationTarget(error)
                if (target?.includes('email')) {
                    throw new ConflictException(
                        `A customer with email ${dto.email} already exists`,
                    )
                }
                if (target?.includes('retailClientId')) {
                    throw new ConflictException(
                        'This shop account is already linked to another customer',
                    )
                }
                if (target?.includes('customerNumber')) continue
                throw error
            }
        }
        if (!customer) {
            throw new ConflictException(
                'Could not allocate a customer number, please retry',
            )
        }

        // Provision a Shop login so the new customer can sign in to the store.
        if (dto.password) {
            const passwordHash = await bcrypt.hash(dto.password, 10)
            try {
                const shopAccount = await client.retailClient.create({
                    data: {
                        email: dto.email,
                        passwordHash,
                        fullName: dto.contactName,
                        phone: dto.phone ?? '',
                    },
                })
                await client.sdCustomer.update({
                    where: { id: customer.id },
                    data: { retailClientId: shopAccount.id },
                })
            } catch (error) {
                if (this.uniqueViolationTarget(error)?.includes('email')) {
                    throw new ConflictException(
                        'A Shop account with this email was created just now — sign them in from the Shop instead',
                    )
                }
                throw error
            }
        }

        return this.findOneRow(customer.id)
    }

    /**
     * Open exposure (creditLimit − availableCredit) is preserved when the limit
     * changes, so availableCredit moves by the same delta and may go negative.
     */
    async update(id: string, dto: UpdateCustomerDto) {
        const current = await this.findOneRow(id)

        const data: Prisma.SdCustomerUncheckedUpdateManyInput = {
            updatedBy: dto.updatedBy,
        }
        if (dto.companyName !== undefined) data.companyName = dto.companyName
        if (dto.contactName !== undefined) data.contactName = dto.contactName
        if (dto.email !== undefined) data.email = dto.email
        if (dto.phone !== undefined) data.phone = dto.phone
        if (dto.status !== undefined) data.status = dto.status
        if (dto.retailClientId !== undefined) {
            if (dto.retailClientId) {
                const shopAccount = await this.prisma.retailClient.findUnique({
                    where: { id: dto.retailClientId },
                    select: { id: true },
                })
                if (!shopAccount) {
                    throw new NotFoundException(
                        'The referenced shop account was not found',
                    )
                }
            }
            data.retailClientId = dto.retailClientId || null
        }
        if (dto.creditLimit !== undefined) {
            const newLimit = new Decimal(dto.creditLimit)
            const delta = newLimit.minus(current.creditLimit)
            data.creditLimit = newLimit
            data.availableCredit = new Decimal(current.availableCredit).plus(delta)
        }

        if (Object.keys(data).length === 1) {
            throw new BadRequestException('No changes supplied')
        }

        try {
            const result = await this.prisma.sdCustomer.updateMany({
                where: {
                    id,
                    creditLimit: current.creditLimit,
                    availableCredit: current.availableCredit,
                },
                data,
            })
            if (result.count === 0) {
                throw new ConflictException(
                    'Customer credit changed concurrently, reload and retry',
                )
            }
        } catch (error) {
            if (this.uniqueViolationTarget(error)?.includes('email')) {
                throw new ConflictException(
                    `A customer with email ${dto.email} already exists`,
                )
            }
            throw error
        }

        return this.findOneRow(id)
    }

    private uniqueViolationTarget(error: unknown): string[] | null {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
        ) {
            const target = error.meta?.target
            return Array.isArray(target) ? target.map(String) : [String(target)]
        }
        return null
    }

    /** `attempt > 0` adds a random suffix after a customerNumber collision. */
    private async nextCustomerNumber(
        attempt = 0,
        client: PrismaService | Prisma.TransactionClient = this.prisma,
    ) {
        return nextCustomerNumberShared(attempt, client)
    }
}
