import { BadRequestException, Injectable, Optional } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import type {
    MmAccountingDispatchPayload,
    MmAccountingLineContext,
} from '../mm/common/mm-accounting-event.types'
import { FicoPostingValidationService } from './fico-posting-validation.service'
import { FicoAccountResolutionService } from './fico-account-resolution.service'

/**
 * Transaction keys `transactionKey()` below can return. Other keys (e.g. supplier
 * invoice) may have mappings, but no MM event resolves to them yet.
 */
export const FICO_RESOLVED_TRANSACTION_KEYS = [
    'GR_IR',
    'GI_COGS',
    'GI_EXPENSE',
    'INVENTORY_SHRINKAGE',
    'INVENTORY_INCREASE_ADJ',
    'LANDED_COST',
    'PRICE_VARIANCE',
] as const

export type ResolvedMmJournalLine = {
    debitAccountId: string
    creditAccountId: string
    amount: Decimal
    materialId: string
    warehouseId?: string | null
    transactionKey: string
}

/**
 * The sole resolver for automatic MM account determination.  MM supplies
 * semantic effects and valuation context; FICO selects the configured accounts.
 */
@Injectable()
export class FicoAccountDeterminationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly postingValidation: FicoPostingValidationService,
        @Optional()
        private readonly accountResolution?: FicoAccountResolutionService,
    ) {}

    async resolveMmPosting(
        payload: MmAccountingDispatchPayload,
    ): Promise<ResolvedMmJournalLine[] | null> {
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId: payload.companyId },
            include: {
                chartOfAccounts: { select: { id: true, status: true } },
                accountDeterminationProfile: {
                    select: { id: true, status: true },
                },
            },
        })

        if (!settings) {
            throw new BadRequestException(
                'Automatic accounting is blocked because company accounting settings are not configured.',
            )
        }
        if (settings.status !== 'ACTIVE') {
            throw new BadRequestException(
                `Automatic accounting is blocked because the company accounting configuration is ${settings.status}.`,
            )
        }
        if (
            !settings.chartOfAccountsId ||
            !settings.chartOfAccounts ||
            settings.chartOfAccounts.status !== 'ACTIVE'
        ) {
            throw new BadRequestException(
                'Automatic accounting is blocked because the assigned chart of accounts is missing or inactive.',
            )
        }
        if (
            !settings.accountDeterminationProfileId ||
            !settings.accountDeterminationProfile ||
            settings.accountDeterminationProfile.status !== 'ACTIVE'
        ) {
            throw new BadRequestException(
                'Automatic accounting is blocked because no active account determination profile is assigned.',
            )
        }

        const postingDate = new Date(payload.postingDate)
        if (Number.isNaN(postingDate.getTime())) {
            throw new BadRequestException('Automatic accounting requires a valid posting date.')
        }
        const transactionKey = this.transactionKey(payload)
        const currency = payload.currencyCode.trim().toUpperCase()
        const fromRules = await this.tryCentralRules(
            payload,
            postingDate,
            currency,
            transactionKey,
        )
        if (fromRules?.length) {
            await this.postingValidation.validate({
                companyId: payload.companyId,
                postingDate,
                source: 'AUTOMATIC',
                currencyCode: currency,
                lines: fromRules.flatMap((line) => [
                    { glAccountId: line.debitAccountId, currency },
                    { glAccountId: line.creditAccountId, currency },
                ]),
            })
            return fromRules
        }
        const mappings = await this.prisma.ficoMmAccountMapping.findMany({
            where: {
                companyId: payload.companyId,
                profileId: settings.accountDeterminationProfileId,
                transactionKeyCode: transactionKey,
                status: 'ACTIVE',
                AND: [
                    {
                        OR: [
                            { effectiveFrom: null },
                            { effectiveFrom: { lte: postingDate } },
                        ],
                    },
                    {
                        OR: [
                            { effectiveTo: null },
                            { effectiveTo: { gte: postingDate } },
                        ],
                    },
                ],
            },
            select: {
                id: true,
                valuationClassId: true,
                valuationScopeKey: true,
                debitAccountId: true,
                creditAccountId: true,
            },
        })

        const resolved: ResolvedMmJournalLine[] = []
        for (const line of payload.lines) {
            const amount = new Decimal(line.totalCost ?? 0).abs()
            if (amount.isZero()) continue
            const mapping = this.mappingForLine(mappings, line)
            if (!mapping) {
                throw new BadRequestException(
                    `No active ${transactionKey} account mapping exists for the material valuation class.`,
                )
            }
            resolved.push({
                debitAccountId: mapping.debitAccountId,
                creditAccountId: mapping.creditAccountId,
                amount,
                materialId: line.materialId,
                warehouseId: line.warehouseId,
                transactionKey,
            })
        }
        if (!resolved.length) {
            throw new BadRequestException(
                'Automatic accounting requires at least one non-zero valued source line.',
            )
        }
        await this.postingValidation.validate({
            companyId: payload.companyId,
            postingDate,
            source: 'AUTOMATIC',
            currencyCode: currency,
            lines: resolved.flatMap((line) => [
                { glAccountId: line.debitAccountId, currency },
                { glAccountId: line.creditAccountId, currency },
            ]),
        })
        return resolved
    }

    private mappingForLine(
        mappings: Array<{
            valuationClassId: string | null
            valuationScopeKey: string
            debitAccountId: string
            creditAccountId: string
        }>,
        line: MmAccountingLineContext,
    ) {
        return (
            mappings.find(
                (mapping) =>
                    !!line.valuationClassId &&
                    mapping.valuationClassId === line.valuationClassId,
            ) ?? mappings.find((mapping) => mapping.valuationScopeKey === '*')
        )
    }

    private async tryCentralRules(
        payload: MmAccountingDispatchPayload,
        postingDate: Date,
        currency: string,
        transactionKey: string,
    ): Promise<ResolvedMmJournalLine[] | null> {
        if (!this.accountResolution) return null
        const transactionType = this.mmTransactionType(payload)
        const resolved: ResolvedMmJournalLine[] = []
        for (const line of payload.lines) {
            const amount = new Decimal(line.totalCost ?? 0).abs()
            if (amount.isZero()) continue
            try {
                const result = await this.accountResolution.resolve({
                    companyId: payload.companyId,
                    sourceModule: 'MM',
                    transactionType,
                    postingDate,
                    currencyCode: currency,
                    transactionKeyCode: transactionKey,
                    valuationClassId: line.valuationClassId ?? null,
                    movementType: line.movementType ?? null,
                })
                const debit = result.debitLines[0]
                const credit = result.creditLines[0]
                if (!debit?.glAccountId || !credit?.glAccountId) {
                    continue
                }
                resolved.push({
                    debitAccountId: debit.glAccountId,
                    creditAccountId: credit.glAccountId,
                    amount,
                    materialId: line.materialId,
                    warehouseId: line.warehouseId,
                    transactionKey,
                })
            } catch (error: unknown) {
                const message =
                    error instanceof Error ? error.message : String(error)
                if (message.includes('No approved, active and effective')) {
                    return null
                }
                throw error
            }
        }
        return resolved.length ? resolved : null
    }

    private mmTransactionType(payload: MmAccountingDispatchPayload) {
        const effects = new Set(payload.accountingEffects)
        if (payload.eventType === 'GoodsReceiptPosted') return 'GOODS_RECEIPT'
        if (payload.eventType === 'GoodsIssuePosted') {
            return payload.issuePurpose === 'SALES'
                ? 'INVENTORY_CONSUMPTION'
                : 'INVENTORY_DECREASE'
        }
        if (effects.has('INVENTORY_LOSS')) return 'INVENTORY_WRITE_OFF'
        if (effects.has('LANDED_COST')) return 'GOODS_RECEIPT'
        if (effects.has('PRICE_VARIANCE')) return 'SUPPLIER_INVOICE'
        if (effects.has('INVENTORY_ADJUSTMENT')) {
            return payload.lines.some((line) =>
                line.movementType.toUpperCase().includes('IN'),
            )
                ? 'INVENTORY_INCREASE'
                : 'INVENTORY_DECREASE'
        }
        throw new BadRequestException(
            `No centralized account determination transaction type is defined for ${payload.eventType}.`,
        )
    }

    private transactionKey(payload: MmAccountingDispatchPayload) {
        const effects = new Set(payload.accountingEffects)
        if (payload.eventType === 'GoodsReceiptPosted') return 'GR_IR'
        if (payload.eventType === 'GoodsIssuePosted') {
            return payload.issuePurpose === 'SALES' ? 'GI_COGS' : 'GI_EXPENSE'
        }
        if (effects.has('INVENTORY_LOSS')) return 'INVENTORY_SHRINKAGE'
        if (effects.has('LANDED_COST')) return 'LANDED_COST'
        if (effects.has('PRICE_VARIANCE')) return 'PRICE_VARIANCE'
        if (effects.has('INVENTORY_ADJUSTMENT')) {
            return payload.lines.some((line) =>
                line.movementType.toUpperCase().includes('IN'),
            )
                ? 'INVENTORY_INCREASE_ADJ'
                : 'INVENTORY_SHRINKAGE'
        }
        throw new BadRequestException(
            `No automatic account-determination transaction key is defined for ${payload.eventType}.`,
        )
    }
}
