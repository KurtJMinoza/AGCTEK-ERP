import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { RetailClientService } from '../retail/retail-client.service'
import {
    CreateCustomerDto,
    CustomerType,
    ListCustomersQueryDto,
    UpdateCustomerDto,
} from './dto/customer.dto'

const CUSTOMER_NUMBER_PREFIX = 'CUST'
const MAX_CREATE_ATTEMPTS = 3

@Injectable()
export class CustomerService {
    constructor(
        private prisma: PrismaService,
        private retailClients: RetailClientService,
    ) {}

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
            orderBy: { companyName: 'asc' },
        })
    }

    async findOne(id: string) {
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
        const customerType = this.resolveCustomerType(dto)
        const onRoot = client === this.prisma
        const attempts = onRoot ? MAX_CREATE_ATTEMPTS : 1
        for (let attempt = 0; attempt < attempts; attempt++) {
            try {
                // A new shop login must not outlive a failed customer insert.
                if (customerType === 'RETAIL' && onRoot) {
                    return await this.prisma.$transaction((tx) =>
                        this.insert(dto, customerType, attempt, tx),
                    )
                }
                return await this.insert(dto, customerType, attempt, client)
            } catch (error) {
                const target = this.uniqueViolationTarget(error)
                if (target?.includes('email')) {
                    throw new ConflictException(
                        `A customer with email ${dto.email} already exists`,
                    )
                }
                if (target?.includes('retailClientId')) {
                    throw new ConflictException(
                        'That shop account is already linked to another customer',
                    )
                }
                if (target?.includes('customerNumber')) continue
                throw error
            }
        }
        throw new ConflictException(
            'Could not allocate a customer number, please retry',
        )
    }

    /** Shop logins that can still be referenced by a new RETAIL customer. */
    listLinkableShopAccounts() {
        return this.retailClients.listUnlinkedAccounts()
    }

    private resolveCustomerType(dto: CreateCustomerDto): CustomerType {
        const customerType = dto.customerType ?? 'B2B'
        const linksAccount = Boolean(dto.retailClientId)
        const createsAccount = Boolean(dto.shopPassword)

        if (customerType === 'B2B') {
            if (linksAccount || createsAccount) {
                throw new BadRequestException(
                    'Shop accounts apply only to RETAIL customers',
                )
            }
            if (dto.creditLimit === undefined) {
                throw new BadRequestException('B2B customers need a credit limit')
            }
            return customerType
        }

        if (linksAccount === createsAccount) {
            throw new BadRequestException(
                'RETAIL customers need either an existing shop account or a new shop login password',
            )
        }
        if ((dto.creditLimit ?? 0) > 0) {
            throw new BadRequestException('RETAIL customers do not carry a credit limit')
        }
        return customerType
    }

    private async insert(
        dto: CreateCustomerDto,
        customerType: CustomerType,
        attempt: number,
        client: PrismaService | Prisma.TransactionClient,
    ) {
        let retailClientId: string | undefined
        if (customerType === 'RETAIL') {
            const account = dto.shopPassword
                ? await this.retailClients.createAccount(
                      {
                          email: dto.email,
                          password: dto.shopPassword,
                          fullName: dto.contactName,
                          phone: dto.phone,
                      },
                      client,
                  )
                : await this.retailClients.requireAccount(dto.retailClientId!, client)
            retailClientId = account.id
        }

        const customerNumber = await this.nextCustomerNumber(attempt, client)
        const creditLimit = new Decimal(dto.creditLimit ?? 0)
        return client.sdCustomer.create({
            data: {
                customerNumber,
                companyName: dto.companyName,
                contactName: dto.contactName,
                email: dto.email,
                phone: dto.phone ?? '',
                creditLimit,
                availableCredit: creditLimit,
                status: dto.status ?? 'ACTIVE',
                customerType,
                retailClientId,
                createdBy: dto.createdBy,
                updatedBy: dto.createdBy,
            },
        })
    }

    /**
     * Open exposure (creditLimit − availableCredit) is preserved when the limit
     * changes, so availableCredit moves by the same delta and may go negative.
     */
    async update(id: string, dto: UpdateCustomerDto) {
        const current = await this.findOne(id)

        const data: Prisma.SdCustomerUpdateManyMutationInput = {
            updatedBy: dto.updatedBy,
        }
        if (dto.companyName !== undefined) data.companyName = dto.companyName
        if (dto.contactName !== undefined) data.contactName = dto.contactName
        if (dto.email !== undefined) data.email = dto.email
        if (dto.phone !== undefined) data.phone = dto.phone
        if (dto.status !== undefined) data.status = dto.status
        if (
            current.customerType === 'RETAIL' &&
            dto.creditLimit !== undefined &&
            dto.creditLimit > 0
        ) {
            throw new BadRequestException('RETAIL customers do not carry a credit limit')
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

        return this.findOne(id)
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
        const count = await client.sdCustomer.count()
        const number = `${CUSTOMER_NUMBER_PREFIX}-${String(count + 1).padStart(6, '0')}`
        return attempt === 0
            ? number
            : `${number}-${randomUUID().slice(0, 4).toUpperCase()}`
    }
}
