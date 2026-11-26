import type { PrismaClient } from '@prisma/client'

export type CompanyGlDefaults = {
    chartOfAccountsId: string | null
    defaultReceivableAccountId: string | null
    defaultCashAccountId: string | null
    defaultSalesRevenueAccountId: string | null
    defaultTaxOutputAccountId: string | null
    defaultCostOfGoodsSoldAccountId: string | null
    defaultInventoryAccountId: string | null
}

export async function loadCompanyGlDefaults(
    prisma: Pick<PrismaClient, 'ficoCompanyAccountingSettings'>,
    companyId: string,
): Promise<CompanyGlDefaults | null> {
    const row = await prisma.ficoCompanyAccountingSettings.findFirst({
        where: { companyId, status: 'ACTIVE' },
        select: {
            chartOfAccountsId: true,
            defaultReceivableAccountId: true,
            defaultCashAccountId: true,
            defaultSalesRevenueAccountId: true,
            defaultTaxOutputAccountId: true,
            defaultCostOfGoodsSoldAccountId: true,
            defaultInventoryAccountId: true,
        },
    })
    return row ?? null
}

export function companyDefaultForMmPair(
    defaults: CompanyGlDefaults | null,
    transactionKey: string,
): { debitAccountId: string; creditAccountId: string } | null {
    if (!defaults) return null
    const key = transactionKey.trim().toUpperCase()
    if (key === 'GI_COGS' || key === 'COGS') {
        if (
            defaults.defaultCostOfGoodsSoldAccountId &&
            defaults.defaultInventoryAccountId
        ) {
            return {
                debitAccountId: defaults.defaultCostOfGoodsSoldAccountId,
                creditAccountId: defaults.defaultInventoryAccountId,
            }
        }
    }
    return null
}

export function companyDefaultForSdRole(
    defaults: CompanyGlDefaults | null,
    role:
        | 'ACCOUNTS_RECEIVABLE'
        | 'SALES_REVENUE'
        | 'OUTPUT_TAX'
        | 'PAYMENT_CLEARING',
): string | null {
    if (!defaults) return null
    switch (role) {
        case 'ACCOUNTS_RECEIVABLE':
            return defaults.defaultReceivableAccountId
        case 'SALES_REVENUE':
            return defaults.defaultSalesRevenueAccountId
        case 'OUTPUT_TAX':
            return defaults.defaultTaxOutputAccountId
        case 'PAYMENT_CLEARING':
            return defaults.defaultCashAccountId
        default:
            return null
    }
}