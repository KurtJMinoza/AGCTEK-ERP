import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export type PosCustomerDetails = {
    contactName?: string
    email?: string
    phone?: string
    customerAccountType?: string
    creditLimit?: number
}

/**
 * Customer of a POS sale.
 *
 * The cashier can type the name of a customer who is not in the Customer
 * Master yet (a first-time buyer). The POS creates the master record with
 * that name so the next sale finds the customer in the list, and the sale is
 * linked to it instead of the anonymous walk-in.
 */
@Injectable()
export class PosCustomerService {
    constructor(private prisma: PrismaService) {}

    /**
     * The Customer Master record of a name: the existing customer with that
     * name, or a new one created for it.
     */
    async resolveByName(
        name: string,
        createdBy?: string | null,
        details: PosCustomerDetails = {},
    ) {
        const clean = name.trim()
        if (!clean) {
            throw new BadRequestException('Enter the customer name.')
        }
        if (clean.length > 200) {
            throw new BadRequestException(
                'The customer name is too long (200 characters max).',
            )
        }

        const existing = await this.prisma.sdCustomer.findFirst({
            where: {
                companyName: { equals: clean, mode: 'insensitive' },
                status: { not: 'BLOCKED' },
            },
            orderBy: { createdAt: 'asc' },
        })
        if (existing) return this.complete(existing, details)

        return this.create(clean, createdBy, details)
    }

    /** Fills the gaps of an existing record (a walk-in that comes back). */
    private async complete(
        customer: {
            id: string
            companyName: string
            email: string | null
            phone: string
            contactName: string
        },
        details: PosCustomerDetails,
    ) {
        const email = details.email?.trim().toLowerCase() || null
        const phone = details.phone?.trim() || null
        const data: Record<string, unknown> = {}
        if (email && !customer.email) data.email = email
        if (phone && !customer.phone) data.phone = phone
        if (!customer.contactName && details.contactName?.trim()) {
            data.contactName = details.contactName.trim()
        }
        if (!Object.keys(data).length) return customer
        return this.prisma.sdCustomer.update({
            where: { id: customer.id },
            data,
        })
    }

    private async create(
        name: string,
        createdBy?: string | null,
        details: PosCustomerDetails = {},
    ) {
        const creditAccount = details.customerAccountType === 'CREDIT'
        const creditLimit = creditAccount ? Number(details.creditLimit ?? 0) : 0
        if (creditAccount && creditLimit <= 0) {
            throw new BadRequestException(
                'A credit customer needs a credit limit.',
            )
        }
        const email = details.email?.trim().toLowerCase() || null
        if (email) {
            const taken = await this.prisma.sdCustomer.findFirst({
                where: { email: { equals: email, mode: 'insensitive' } },
                select: { id: true, companyName: true },
            })
            if (taken) {
                throw new BadRequestException(
                    `The email ${email} belongs to ${taken.companyName}.`,
                )
            }
        }

        for (let attempt = 0; attempt < 5; attempt++) {
            const customerNumber = await this.nextNumber(attempt)
            try {
                return await this.prisma.sdCustomer.create({
                    data: {
                        customerNumber,
                        companyName: name,
                        contactName: details.contactName?.trim() || name,
                        email,
                        phone: details.phone?.trim() || '',
                        status: 'ACTIVE',
                        customerAccountType: creditAccount
                            ? 'CREDIT'
                            : 'NON_CREDIT',
                        customerCategory: 'RETAIL',
                        paymentTerms: creditAccount ? 'NET_30' : 'IMMEDIATE',
                        creditStatus: creditAccount ? 'PENDING' : 'NOT_APPLICABLE',
                        creditLimit,
                        availableCredit: creditLimit,
                        paymentMode: 'CASH',
                        createdBy: createdBy ?? null,
                    },
                })
            } catch (error) {
                const code =
                    typeof error === 'object' &&
                    error !== null &&
                    'code' in error
                        ? (error as { code?: string }).code
                        : undefined
                if (code === 'P2002') continue
                throw error
            }
        }
        throw new BadRequestException(
            'Could not allocate a customer number, please retry',
        )
    }

    /** POS customer numbers: WALK-<n>. */
    private async nextNumber(attempt: number) {
        const rows = await this.prisma.sdCustomer.findMany({
            where: { customerNumber: { startsWith: 'WALK-' } },
            select: { customerNumber: true },
        })
        let max = 0
        for (const row of rows) {
            const match = /^WALK-(\d+)$/.exec(row.customerNumber)
            if (match) max = Math.max(max, Number(match[1]))
        }
        return `WALK-${String(max + 1 + attempt).padStart(6, '0')}`
    }
}
