import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAccountResolutionService } from './fico-account-resolution.service'
import {
    merchandisingGlCodesForCategory,
    type MerchandisingGlTriplet,
} from './fico-merchandising-account-map'
import type { MmAccountingLineContext } from '../mm/common/mm-accounting-event.types'
import {
    ficoMmTransactionTypeForKey,
} from './fico-mm-inventory-determination.policy'

export type MerchandisingGiCogsPair = {
    debitAccountId: string
    creditAccountId: string
    determinationCode: string | null
    ruleId: string | null
}

@Injectable()
export class FicoMmMerchandisingAccountResolutionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly accountResolution: FicoAccountResolutionService,
    ) {}

    async resolveGiCogsPair(input: {
        companyId: string
        postingDate: Date
        currencyCode: string
        line: MmAccountingLineContext
    }): Promise<MerchandisingGiCogsPair | null> {
        const groupCode = input.line.materialCategoryCode?.trim().toUpperCase()
        if (!groupCode && !input.line.valuationClassId) return null

        try {
            const result = await this.accountResolution.resolve({
                companyId: input.companyId,
                sourceModule: 'MM',
                transactionType: ficoMmTransactionTypeForKey('GI_COGS'),
                postingDate: input.postingDate,
                currencyCode: input.currencyCode,
                transactionKeyCode: 'GI_COGS',
                valuationClassId: input.line.valuationClassId ?? null,
                materialGroupCode: groupCode ?? null,
                movementType: input.line.movementType ?? null,
            })
            const debit = result.debitLines[0]
            const credit = result.creditLines[0]
            if (debit?.glAccountId && credit?.glAccountId) {
                return {
                    debitAccountId: debit.glAccountId,
                    creditAccountId: credit.glAccountId,
                    determinationCode: result.rule.determinationCode,
                    ruleId: result.rule.id,
                }
            }
        } catch {
            /* fall through to configured category map */
        }

        const triplet = merchandisingGlCodesForCategory(groupCode)
        if (!triplet) return null
        return this.resolveTripletOnCoa(input.companyId, triplet)
    }

    private async resolveTripletOnCoa(
        companyId: string,
        triplet: MerchandisingGlTriplet,
    ): Promise<MerchandisingGiCogsPair | null> {
        const settings = await this.prisma.ficoCompanyAccountingSettings.findFirst(
            {
                where: { companyId, status: 'ACTIVE' },
                select: { chartOfAccountsId: true },
            },
        )
        if (!settings?.chartOfAccountsId) return null

        const accounts = await this.prisma.ficoGlAccount.findMany({
            where: {
                chartOfAccountsId: settings.chartOfAccountsId,
                accountCode: { in: [triplet.cogs, triplet.inventory] },
                status: 'ACTIVE',
                isPostingAccount: true,
            },
            select: { id: true, accountCode: true },
        })
        const cogs = accounts.find((a) => a.accountCode === triplet.cogs)
        const inventory = accounts.find((a) => a.accountCode === triplet.inventory)
        if (!cogs?.id || !inventory?.id) return null

        const assigned = await this.prisma.ficoCompanyGlAccount.findMany({
            where: {
                companyId,
                glAccountId: { in: [cogs.id, inventory.id] },
                postingEnabled: true,
            },
            select: { glAccountId: true },
        })
        if (assigned.length < 2) return null

        return {
            debitAccountId: cogs.id,
            creditAccountId: inventory.id,
            determinationCode: `MAP:${triplet.cogs}/${triplet.inventory}`,
            ruleId: null,
        }
    }
}