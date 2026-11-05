import { BadRequestException, Injectable } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import type {
    MmAccountingDispatchPayload,
    MmAccountingLineContext,
} from '../mm/common/mm-accounting-event.types'
import { FicoPostingValidationService } from './fico-posting-validation.service'

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

        // FICO was introduced after MM.  A company that has not opted in keeps
        // the existing event bridge, but an explicitly configured company may
        // never silently fall back to a header-only journal.
        if (!settings) return null
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
