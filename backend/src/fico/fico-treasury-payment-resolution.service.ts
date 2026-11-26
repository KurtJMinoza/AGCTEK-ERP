import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAccountResolutionService } from './fico-account-resolution.service'
import { FICO_TREASURY_PAYMENT_METHOD_HINTS } from './fico-treasury-payment-determination.policy'

const Decimal = Prisma.Decimal

export type PaymentResolutionInput = {
    companyId: string
    paymentMethodCode: string
    currencyCode: string
    postingDate: Date
    branchId?: string | null
    providerCode?: string | null
    treasuryAccountId?: string | null
    side: 'DEBIT' | 'CREDIT'
    transactionPurpose?: string
}

export type PaymentResolutionResult = {
    glAccountId: string
    accountCode: string
    source: 'TREASURY_ACCOUNT' | 'ACCOUNT_DETERMINATION' | 'PAYMENT_METHOD_GL'
    treasuryAccountId?: string
}

function kindForMethod(code: string): string | null {
    const upper = code.toUpperCase()
    if (upper === 'CASH') return 'CASH_ON_HAND'
    if (['CARD', 'CREDIT_CARD', 'DEBIT_CARD'].includes(upper)) return 'CARD_CLEARING'
    if (['GCASH', 'MAYA', 'GRABPAY', 'SHOPEEPAY', 'EWALLET'].includes(upper)) {
        return 'EWALLET_CLEARING'
    }
    if (upper === 'BANK_TRANSFER' || upper === 'CHECK') return 'BANK'
    return null
}

function transactionKeyForMethod(code: string): string {
    const hint = FICO_TREASURY_PAYMENT_METHOD_HINTS.find(
        (row) => row.paymentMethodCode.toUpperCase() === code.toUpperCase(),
    )
    return hint?.typicalTransactionKeys[0] ?? 'PAYMENT_CLEARING'
}

@Injectable()
export class FicoTreasuryPaymentResolutionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly accountResolution: FicoAccountResolutionService,
    ) {}

    async resolvePaymentAccount(
        input: PaymentResolutionInput,
    ): Promise<PaymentResolutionResult> {
        const method = input.paymentMethodCode.trim().toUpperCase()
        const postingDate = new Date(input.postingDate)

        if (input.treasuryAccountId) {
            const explicit = await this.prisma.ficoTreasuryAccount.findFirst({
                where: {
                    id: input.treasuryAccountId,
                    companyId: input.companyId,
                    status: 'ACTIVE',
                    postingBlocked: false,
                },
                include: { glAccount: { select: { id: true, accountCode: true } } },
            })
            if (explicit) {
                return {
                    glAccountId: explicit.glAccountId,
                    accountCode: explicit.glAccount.accountCode,
                    source: 'TREASURY_ACCOUNT',
                    treasuryAccountId: explicit.id,
                }
            }
        }

        const kind = kindForMethod(method)
        const treasury = await this.prisma.ficoTreasuryAccount.findFirst({
            where: {
                companyId: input.companyId,
                status: 'ACTIVE',
                postingBlocked: false,
                currencyCode: input.currencyCode.toUpperCase(),
                ...(kind ? { accountKind: kind } : {}),
                ...(input.branchId ? { OR: [{ branchId: input.branchId }, { branchId: null }] } : {}),
                paymentMethodCode: method,
            },
            orderBy: [{ branchId: 'desc' }, { updatedAt: 'desc' }],
            include: { glAccount: { select: { id: true, accountCode: true } } },
        })
        if (treasury) {
            return {
                glAccountId: treasury.glAccountId,
                accountCode: treasury.glAccount.accountCode,
                source: 'TREASURY_ACCOUNT',
                treasuryAccountId: treasury.id,
            }
        }

        const paymentMethod = await this.prisma.sdPaymentMethod.findUnique({
            where: { code: method },
            select: { glAccountCode: true },
        })
        if (paymentMethod?.glAccountCode) {
            const settings = await this.prisma.ficoCompanyAccountingSettings.findFirst({
                where: { companyId: input.companyId, status: 'ACTIVE' },
                select: { chartOfAccountsId: true },
            })
            if (settings?.chartOfAccountsId) {
                const gl = await this.prisma.ficoGlAccount.findFirst({
                    where: {
                        chartOfAccountsId: settings.chartOfAccountsId,
                        accountCode: paymentMethod.glAccountCode,
                        status: 'ACTIVE',
                        isPostingAccount: true,
                    },
                    select: { id: true, accountCode: true },
                })
                if (gl) {
                    return {
                        glAccountId: gl.id,
                        accountCode: gl.accountCode,
                        source: 'PAYMENT_METHOD_GL',
                    }
                }
            }
        }

        const transactionKey = transactionKeyForMethod(method)
        try {
            const resolved = await this.accountResolution.resolveDetermination({
                companyId: input.companyId,
                sourceModule: 'SD',
                postingDate,
                currencyCode: input.currencyCode,
                transactionKey,
                dimensions: {
                    paymentMethodCode: method,
                    branchId: input.branchId ?? undefined,
                    paymentProviderCode: input.providerCode ?? undefined,
                },
            })
            const lines =
                input.side === 'DEBIT'
                    ? resolved.resolution.debitLines
                    : resolved.resolution.creditLines
            const line = lines[0]
            return {
                glAccountId: line?.glAccountId ?? resolved.glAccountId,
                accountCode: line?.accountCode ?? resolved.glAccountCode,
                source: 'ACCOUNT_DETERMINATION',
            }
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : `Could not resolve settlement account for ${method}.`
            throw new BadRequestException(message)
        }
    }
}