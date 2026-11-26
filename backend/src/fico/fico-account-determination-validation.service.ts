import {
    BadRequestException,
    ConflictException,
    Injectable,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
    ficoAssertAccountTypeForCategory,
    ficoCatalogEntryForKey,
    ficoRuleLineSignature,
} from './fico-account-determination-policy'
import { FicoPostingValidationService } from './fico-posting-validation.service'
import {
    FICO_DETERMINATION_DIMENSIONS,
    type FicoDeterminationDimension,
} from './fico-account-determination.constants'
import { FICO_DETERMINATION_ID_DIMENSIONS } from './fico-determination-dimension.util'

type RuleForValidation = {
    id: string
    determinationCode: string
    companyId: string
    sourceModule: string
    transactionType: string
    transactionKeyCode: string | null
    priority: number
    effectiveFrom: Date | null
    effectiveTo: Date | null
    status: string
    valuationClassId: string | null
    materialTypeCode: string | null
    materialGroupCode: string | null
    movementType: string | null
    customerAccountGroup: string | null
    supplierAccountGroup: string | null
    salesOrganization: string | null
    distributionChannel: string | null
    salesChannelCode: string | null
    taxCodeId: string | null
    paymentMethodCode: string | null
    bankAccountId: string | null
    paymentProviderCode: string | null
    currencyCode: string | null
    branchId: string | null
    assetClassCode: string | null
    depreciationAreaCode: string | null
    documentTypeCode: string | null
    productionOrderTypeCode: string | null
    costElementCategoryCode: string | null
    controllingAreaCode: string | null
    lines: Array<{
        lineNumber: number
        side: string
        glAccountId: string
        glAccount: {
            accountCode: string
            accountType: string
        }
    }>
}

function dayStart(value: Date) {
    return new Date(
        Date.UTC(
            value.getUTCFullYear(),
            value.getUTCMonth(),
            value.getUTCDate(),
        ),
    )
}

function rangesOverlap(
    aFrom: Date | null,
    aTo: Date | null,
    bFrom: Date | null,
    bTo: Date | null,
) {
    const startA = aFrom ? dayStart(aFrom).getTime() : Number.NEGATIVE_INFINITY
    const endA = aTo ? dayStart(aTo).getTime() : Number.POSITIVE_INFINITY
    const startB = bFrom ? dayStart(bFrom).getTime() : Number.NEGATIVE_INFINITY
    const endB = bTo ? dayStart(bTo).getTime() : Number.POSITIVE_INFINITY
    return startA <= endB && startB <= endA
}

@Injectable()
export class FicoAccountDeterminationValidationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly postingValidation: FicoPostingValidationService,
    ) {}

    assertEffectiveWindow(effectiveFrom: Date | null, effectiveTo: Date | null) {
        if (effectiveFrom && effectiveTo && dayStart(effectiveFrom) > dayStart(effectiveTo)) {
            throw new BadRequestException(
                'Effective start date must be on or before the effective end date.',
            )
        }
    }

    async assertRuleAccountsEligible(
        rule: RuleForValidation,
        chartOfAccountsId: string,
        currency: string,
    ) {
        const postingDate = rule.effectiveFrom ?? new Date()
        const keyEntry = rule.transactionKeyCode
            ? ficoCatalogEntryForKey(rule.transactionKeyCode)
            : undefined

        for (const line of rule.lines) {
            await this.postingValidation.assertAccountPostable(
                rule.companyId,
                line.glAccountId,
                'AUTOMATIC',
                currency,
                chartOfAccountsId,
                postingDate,
            )
            if (rule.sourceModule === 'MM' && this.prisma?.ficoGlAccount?.findUnique) {
                const gl = await this.prisma.ficoGlAccount.findUnique({
                    where: { id: line.glAccountId },
                    select: {
                        accountCode: true,
                        isReconciliationAccount: true,
                        reconciliationType: true,
                    },
                })
                if (gl?.isReconciliationAccount && gl.reconciliationType === 'AP') {
                    throw new BadRequestException(
                        `Account ${gl.accountCode} is an AP reconciliation control account and cannot be mapped to MM determination rule ${rule.determinationCode}.`,
                    )
                }
            }
            if (keyEntry) {
                ficoAssertAccountTypeForCategory(
                    keyEntry.accountingCategory,
                    line.glAccount.accountType,
                    line.glAccount.accountCode,
                )
            }
        }
    }

    async assertSafeToActivate(rule: RuleForValidation) {
        this.assertEffectiveWindow(rule.effectiveFrom, rule.effectiveTo)

        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId: rule.companyId },
            select: {
                chartOfAccountsId: true,
                baseCurrency: true,
                status: true,
            },
        })
        if (!settings?.chartOfAccountsId) {
            throw new BadRequestException(
                'Assign and activate company accounting before activating determination rules.',
            )
        }

        await this.assertRuleAccountsEligible(
            rule,
            settings.chartOfAccountsId,
            (settings.baseCurrency || 'PHP').toUpperCase(),
        )

        const active = await this.prisma.ficoAccountDeterminationRule.findMany({
            where: {
                companyId: rule.companyId,
                sourceModule: rule.sourceModule,
                transactionType: rule.transactionType,
                status: 'ACTIVE',
                NOT: { id: rule.id },
            },
            include: {
                lines: { orderBy: { lineNumber: 'asc' } },
            },
        })

        const signature = this.dimensionSignature(rule)
        const lineSig = ficoRuleLineSignature(rule.lines)

        for (const other of active) {
            if (this.dimensionSignature(other) !== signature) continue

            if (rangesOverlap(rule.effectiveFrom, rule.effectiveTo, other.effectiveFrom, other.effectiveTo)) {
                const otherSig = ficoRuleLineSignature(other.lines)
                if (otherSig !== lineSig) {
                    throw new ConflictException(
                        `Rule ${rule.determinationCode} overlaps ${other.determinationCode} with identical dimensions but different target accounts (rule ids ${rule.id}, ${other.id}).`,
                    )
                }
                throw new ConflictException(
                    `Rule ${rule.determinationCode} overlaps ${other.determinationCode} with identical dimensions and effective dates. Deactivate or adjust effective windows first.`,
                )
            }

            if (
                rule.priority === other.priority &&
                rangesOverlap(rule.effectiveFrom, rule.effectiveTo, other.effectiveFrom, other.effectiveTo)
            ) {
                throw new ConflictException(
                    `Ambiguous priorities: ${rule.determinationCode} and ${other.determinationCode} share priority ${rule.priority} in the same effective window.`,
                )
            }
        }
    }

    private dimensionSignature(input: {
        transactionKeyCode?: string | null
    } & Record<FicoDeterminationDimension, string | null>) {
        const key = input.transactionKeyCode?.trim().toUpperCase() ?? ''
        const parts = FICO_DETERMINATION_DIMENSIONS.map((dimension) => {
            const value = input[dimension] ?? ''
            if ((FICO_DETERMINATION_ID_DIMENSIONS as readonly string[]).includes(dimension)) {
                return value
            }
            return value.toString().toUpperCase()
        })
        return [key, ...parts].join('|')
    }
}