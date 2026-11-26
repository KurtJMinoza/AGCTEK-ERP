import { BadRequestException, Injectable, Optional } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAccountsReceivableService } from './fico-accounts-receivable.service'

type CreditCheckInput = {
    companyId: string
    customerId: string
    /** Incremental exposure being authorized (decimal string or number). */
    additionalExposure: string | number
    context: string
    /** When true, only CREDIT account customers are enforced. */
    creditCustomersOnly?: boolean
}

@Injectable()
export class FicoArCreditCheckService {
    constructor(
        private readonly prisma: PrismaService,
        @Optional()
        private readonly accountsReceivable?: FicoAccountsReceivableService,
    ) {}

    async assertWithinCreditLimit(input: CreditCheckInput): Promise<void> {
        const amount = new Decimal(input.additionalExposure)
        if (!amount.gt(0)) return

        const customer = await this.prisma.sdCustomer.findUnique({
            where: { id: input.customerId },
            select: {
                id: true,
                customerAccountType: true,
                creditLimit: true,
                creditStatus: true,
                status: true,
            },
        })
        if (!customer) {
            throw new BadRequestException('Customer not found for credit checking.')
        }
        if (customer.status === 'BLOCKED' || customer.creditStatus === 'SUSPENDED') {
            throw new BadRequestException(
                `${input.context}: customer credit is blocked or suspended.`,
            )
        }

        const companyAccount = await this.prisma.ficoCustomerCompanyAccount.findUnique({
            where: {
                customerId_companyId: {
                    customerId: input.customerId,
                    companyId: input.companyId,
                },
            },
            select: { creditLimit: true, postingBlocked: true },
        })
        if (companyAccount?.postingBlocked) {
            throw new BadRequestException(
                `${input.context}: customer financial posting is blocked for this company.`,
            )
        }

        const onCreditTerms = customer.customerAccountType === 'CREDIT'
        if (!onCreditTerms) {
            // Walk-in / cash customers (NON_CREDIT) may still get POS receivables
            // without a formal credit line — do not enforce limit 0 from AR profiles.
            return
        }

        await this.accountsReceivable?.recalculateCreditExposure(
            input.companyId,
            input.customerId,
        )

        const profile = await this.prisma.ficoArCreditProfile.findUnique({
            where: {
                customerId_companyId: {
                    customerId: input.customerId,
                    companyId: input.companyId,
                },
            },
            select: {
                creditLimit: true,
                creditExposure: true,
                availableCredit: true,
                creditBlocked: true,
            },
        })

        if (profile?.creditBlocked) {
            throw new BadRequestException(
                `${input.context}: customer credit is blocked for this company.`,
            )
        }

        const limit = profile?.creditLimit ?? customer.creditLimit ?? new Decimal(0)
        const available =
            profile?.availableCredit ??
            limit.minus(profile?.creditExposure ?? 0)

        const exposure = profile?.creditExposure ?? limit.minus(available)
        if (amount.gt(available)) {
            throw new BadRequestException(
                `${input.context}: credit limit exceeded. Approved limit ${limit.toFixed(2)}, utilized ${exposure.toFixed(2)}, available ${available.toFixed(2)}, requested ${amount.toFixed(2)}.`,
            )
        }
    }
}