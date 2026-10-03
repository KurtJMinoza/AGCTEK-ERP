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
import {
    CreateCustomerDto,
    ListCustomersQueryDto,
    UpdateCustomerDto,
} from './dto/customer.dto'

const CUSTOMER_NUMBER_PREFIX = 'CUST'
const MAX_CREATE_ATTEMPTS = 3

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
            orderBy: { companyName: 'asc' },
        })
    }

    async findOne(id: string) {
        const row = await this.prisma.sdCustomer.findUnique({ where: { id } })
        if (!row) throw new NotFoundException('Customer not found')
        return row
    }

    async create(dto: CreateCustomerDto) {
        for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
            const customerNumber = await this.nextCustomerNumber(attempt)
            try {
                return await this.prisma.sdCustomer.create({
                    data: {
                        customerNumber,
                        companyName: dto.companyName,
                        contactName: dto.contactName,
                        email: dto.email,
                        phone: dto.phone ?? '',
                        creditLimit: new Decimal(dto.creditLimit),
                        availableCredit: new Decimal(dto.creditLimit),
                        status: dto.status ?? 'ACTIVE',
                        createdBy: dto.createdBy,
                        updatedBy: dto.createdBy,
                    },
                })
            } catch (error) {
                const target = this.uniqueViolationTarget(error)
                if (target?.includes('email')) {
                    throw new ConflictException(
                        `A customer with email ${dto.email} already exists`,
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
    private async nextCustomerNumber(attempt = 0) {
        const count = await this.prisma.sdCustomer.count()
        const number = `${CUSTOMER_NUMBER_PREFIX}-${String(count + 1).padStart(6, '0')}`
        return attempt === 0
            ? number
            : `${number}-${randomUUID().slice(0, 4).toUpperCase()}`
    }
}
