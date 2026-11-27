import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAccountResolutionService } from './fico-account-resolution.service'

export type SalesRevenueMaterialContext = {
    materialId: string | null
    materialCode: string | null
    valuationClassId: string | null
    materialTypeCode: string | null
    materialCategoryCode: string | null
    materialCategoryName: string | null
}

export function salesRevenueBucketKey(ctx: SalesRevenueMaterialContext): string {
    return [
        ctx.valuationClassId ?? '',
        ctx.materialTypeCode ?? '',
        ctx.materialCategoryCode ?? '',
    ].join('|')
}

export function salesRevenueDeterminationDimensions(
    ctx: SalesRevenueMaterialContext,
): Record<string, string | undefined> {
    const dimensions: Record<string, string | undefined> = {}
    if (ctx.valuationClassId?.trim()) {
        dimensions.valuationClassId = ctx.valuationClassId.trim()
    }
    if (ctx.materialTypeCode?.trim()) {
        dimensions.materialTypeCode = ctx.materialTypeCode.trim().toUpperCase()
    }
    if (ctx.materialCategoryCode?.trim()) {
        dimensions.materialGroupCode = ctx.materialCategoryCode.trim().toUpperCase()
    }
    return dimensions
}

export function hasSalesRevenueClassification(
    ctx: SalesRevenueMaterialContext,
): boolean {
    return Boolean(
        ctx.valuationClassId?.trim() ||
            ctx.materialTypeCode?.trim() ||
            ctx.materialCategoryCode?.trim(),
    )
}

export { AWIC_CATEGORY_REVENUE_GL } from './fico-merchandising-account-map'
import { AWIC_CATEGORY_REVENUE_GL } from './fico-merchandising-account-map'

/** Product sales revenue (exclude 63xx other-income rows mis-typed as REVENUE on import). */
export function isProductSalesRevenueAccount(account: {
    accountCode: string
    accountName: string
}): boolean {
    if (!/^40\d{2}$/.test(account.accountCode)) return false
    return /\bSALES\b/i.test(account.accountName)
}

function fuzzyRevenueTokenMatch(a: string, b: string): boolean {
    if (a === b) return true
    if (Math.min(a.length, b.length) < 5) return false
    return a.includes(b) || b.includes(a)
}

function normalizeToken(value: string) {
    return value
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
}

function tokenizeForMatch(value: string): string[] {
    const norm = normalizeToken(value)
    if (!norm) return []
    return norm.split('_').filter((part) => part.length >= 3)
}

/**
 * Match material category / type tokens to AWIC SALES-* revenue accounts on the chart.
 */
export function matchRevenueGlAccountCodeFromCoa(
    material: SalesRevenueMaterialContext,
    revenueAccounts: Array<{ accountCode: string; accountName: string }>,
): string | null {
    const categoryCode = material.materialCategoryCode?.trim().toUpperCase() ?? ''
    const categoryName = material.materialCategoryName?.trim() ?? ''
    const typeCode = material.materialTypeCode?.trim().toUpperCase() ?? ''

    if (categoryCode && AWIC_CATEGORY_REVENUE_GL[categoryCode]) {
        return AWIC_CATEGORY_REVENUE_GL[categoryCode]
    }

    for (const [key, glCode] of Object.entries(AWIC_CATEGORY_REVENUE_GL)) {
        if (
            categoryCode.includes(key) ||
            normalizeToken(categoryName).includes(key)
        ) {
            return glCode
        }
    }

    const searchTokens = [
        ...tokenizeForMatch(categoryCode),
        ...tokenizeForMatch(categoryName),
        ...tokenizeForMatch(typeCode),
    ]
    if (!searchTokens.length) return null

    const salesAccounts = revenueAccounts.filter(isProductSalesRevenueAccount)
    if (!salesAccounts.length) return null

    let best: { code: string; score: number } | null = null
    for (const account of salesAccounts) {
        const name = account.accountName.toUpperCase().replace(/SALES[-\s]*/i, '')
        const nameTokens = tokenizeForMatch(name)
        let score = 0
        for (const token of searchTokens) {
            if (
                nameTokens.some((t) => fuzzyRevenueTokenMatch(token, t))
            ) {
                score += 1
            }
            if (token.length >= 5 && name.includes(token)) score += 2
        }
        if (score > 0 && (!best || score > best.score)) {
            best = { code: account.accountCode, score }
        }
    }
    return best?.code ?? null
}

@Injectable()
export class FicoSdSalesRevenueResolutionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly accountResolution: FicoAccountResolutionService,
    ) {}

    async resolveSalesRevenueGlAccountId(input: {
        companyId: string
        postingDate: Date
        currency: string
        material: SalesRevenueMaterialContext
        defaultRevenueAccountId: string | null
    }): Promise<string> {
        const dimensions = salesRevenueDeterminationDimensions(input.material)
        const hasClassification = hasSalesRevenueClassification(input.material)

        if (hasClassification) {
            try {
                const resolved =
                    await this.accountResolution.resolveDetermination({
                        companyId: input.companyId,
                        sourceModule: 'SD',
                        postingDate: input.postingDate,
                        currencyCode: input.currency,
                        transactionKey: 'SALES_REVENUE',
                        dimensions,
                    })
                const line =
                    resolved.resolution.creditLines[0] ??
                    resolved.resolution.lines.find((l) => l.side === 'CREDIT')
                if (line?.glAccountId) return line.glAccountId
                if (resolved.glAccountId) return resolved.glAccountId
            } catch {
                /* try COA keyword match next */
            }
        }

        const settings = await this.prisma.ficoCompanyAccountingSettings.findFirst(
            {
                where: { companyId: input.companyId, status: 'ACTIVE' },
                select: { chartOfAccountsId: true },
            },
        )
        if (settings?.chartOfAccountsId && hasClassification) {
            const revenueAccounts = await this.prisma.ficoGlAccount.findMany({
                where: {
                    chartOfAccountsId: settings.chartOfAccountsId,
                    accountType: 'REVENUE',
                    isPostingAccount: true,
                    status: 'ACTIVE',
                },
                select: { id: true, accountCode: true, accountName: true },
            })
            const matchedCode = matchRevenueGlAccountCodeFromCoa(
                input.material,
                revenueAccounts,
            )
            if (matchedCode) {
                const account = revenueAccounts.find(
                    (row) => row.accountCode === matchedCode,
                )
                if (account) return account.id
            }
        }

        if (input.material.materialId && hasClassification) {
            throw new BadRequestException(
                `No sales revenue G/L mapping for material ${input.material.materialCode ?? input.material.materialId} ` +
                    `(category ${input.material.materialCategoryCode ?? '—'}, type ${input.material.materialTypeCode ?? '—'}). ` +
                    'Configure an SD SALES_REVENUE account determination rule or extend the category → revenue map.',
            )
        }

        if (input.defaultRevenueAccountId) return input.defaultRevenueAccountId
        throw new BadRequestException(
            'No company default sales revenue account is configured.',
        )
    }
}