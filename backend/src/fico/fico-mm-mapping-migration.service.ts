import {
    BadRequestException,
    Injectable,
    Logger,
} from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateDeterminationInput } from './fico-account-determination-rules.service'
import { FicoAccountDeterminationRulesService } from './fico-account-determination-rules.service'
import { FicoAccountResolutionService } from './fico-account-resolution.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { FicoPostingValidationService } from './fico-posting-validation.service'
import {
    ficoCanonicalMmTransactionKey,
    ficoMmTransactionTypeForKey,
} from './fico-mm-inventory-determination.policy'
import { ficoCatalogEntryForKey } from './fico-account-determination-policy'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'

export type MmMappingMigrationDifference = {
    transactionKeyCode: string
    valuationClassId: string | null
    valuationClassCode: string | null
    legacyDebitAccountId: string
    legacyCreditAccountId: string
    centralDebitAccountIds: string[]
    centralCreditAccountIds: string[]
    differs: boolean
    reason?: string
}

export type MmMappingMigrationReport = {
    companyId: string
    generatedAt: string
    totalLegacyMappings: number
    successfullyTransformed: number
    missingTransactionKeys: Array<{ mappingId: string; code: string }>
    invalidAccountAssignments: Array<{ mappingId: string; reason: string }>
    conflictingRules: Array<{ mappingId: string; determinationCode: string; reason: string }>
    unresolvedMappings: Array<{ mappingId: string; reason: string }>
    resolutionDifferences: MmMappingMigrationDifference[]
    rulesReadyForActivation: Array<{
        proposedDeterminationCode: string
        transactionKeyCode: string
        valuationClassId: string | null
    }>
    rulesRequiringFinanceReview: Array<{
        proposedDeterminationCode: string
        reason: string
    }>
    proposedRules: CreateDeterminationInput[]
    dryRun: boolean
}

const MAPPING_INCLUDE = {
    transactionKey: { select: { code: true, name: true } },
    valuationClass: { select: { id: true, code: true, name: true } },
    debitAccount: {
        select: { id: true, accountCode: true, accountName: true, accountType: true, status: true },
    },
    creditAccount: {
        select: { id: true, accountCode: true, accountName: true, accountType: true, status: true },
    },
} as const

@Injectable()
export class FicoMmMappingMigrationService {
    private readonly logger = new Logger(FicoMmMappingMigrationService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly resolution: FicoAccountResolutionService,
        private readonly rules: FicoAccountDeterminationRulesService,
        private readonly postingValidation: FicoPostingValidationService,
    ) {}

    async dryRunReport(
        companyId: string,
        user: AuthRequestUser,
        options?: { postingDate?: string; compareCentral?: boolean },
    ): Promise<MmMappingMigrationReport> {
        await this.access.assertAccess(user, companyId)
        return this.buildReport(companyId, {
            dryRun: true,
            postingDate: options?.postingDate,
            compareCentral: options?.compareCentral !== false,
        })
    }

    async applyProposedDraftRules(
        companyId: string,
        user: AuthRequestUser,
        options?: { postingDate?: string },
    ) {
        const report = await this.buildReport(companyId, {
            dryRun: false,
            postingDate: options?.postingDate,
            compareCentral: true,
        })
        const created = []
        for (const rule of report.proposedRules) {
            if (
                report.rulesRequiringFinanceReview.some(
                    (entry) => entry.proposedDeterminationCode === rule.determinationCode,
                )
            ) {
                continue
            }
            created.push(await this.rules.create(rule, user))
        }
        return { report, createdRuleIds: created.map((row) => row.id) }
    }

    /** Shadow comparison for one payload — never persists journals. */
    async shadowComparePayload(
        payload: MmAccountingDispatchPayload,
        postingDate = payload.postingDate,
    ): Promise<MmMappingMigrationDifference[]> {
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId: payload.companyId },
            select: {
                accountDeterminationProfileId: true,
                chartOfAccountsId: true,
                baseCurrency: true,
            },
        })
        if (!settings?.accountDeterminationProfileId) {
            throw new BadRequestException('Company MM profile is not configured.')
        }
        const mappings = await this.prisma.ficoMmAccountMapping.findMany({
            where: {
                companyId: payload.companyId,
                profileId: settings.accountDeterminationProfileId,
                status: 'ACTIVE',
            },
            include: MAPPING_INCLUDE,
        })
        const differences: MmMappingMigrationDifference[] = []
        for (const line of payload.lines) {
            const txnKey = this.lineTransactionKey(payload, line.materialId)
            const mapping = this.pickMapping(mappings, line.valuationClassId ?? null, txnKey)
            if (!mapping) continue
            differences.push(
                await this.compareOne(
                    payload.companyId,
                    postingDate,
                    settings.baseCurrency || 'PHP',
                    mapping,
                    line.valuationClassId ?? null,
                    txnKey,
                ),
            )
        }
        return differences
    }

    private async buildReport(
        companyId: string,
        options: {
            dryRun: boolean
            postingDate?: string
            compareCentral: boolean
        },
    ): Promise<MmMappingMigrationReport> {
        const postingDate = options.postingDate ?? new Date().toISOString().slice(0, 10)
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId },
            select: {
                chartOfAccountsId: true,
                baseCurrency: true,
                accountDeterminationProfileId: true,
            },
        })
        if (!settings?.chartOfAccountsId || !settings.accountDeterminationProfileId) {
            throw new BadRequestException(
                'Company chart of accounts and account determination profile are required for migration.',
            )
        }

        const mappings = await this.prisma.ficoMmAccountMapping.findMany({
            where: {
                companyId,
                profileId: settings.accountDeterminationProfileId,
            },
            include: MAPPING_INCLUDE,
            orderBy: [{ transactionKeyCode: 'asc' }, { valuationScopeKey: 'asc' }],
        })

        const missingTransactionKeys: MmMappingMigrationReport['missingTransactionKeys'] = []
        const invalidAccountAssignments: MmMappingMigrationReport['invalidAccountAssignments'] = []
        const conflictingRules: MmMappingMigrationReport['conflictingRules'] = []
        const unresolvedMappings: MmMappingMigrationReport['unresolvedMappings'] = []
        const resolutionDifferences: MmMappingMigrationDifference[] = []
        const proposedRules: CreateDeterminationInput[] = []
        const rulesReadyForActivation: MmMappingMigrationReport['rulesReadyForActivation'] = []
        const rulesRequiringFinanceReview: MmMappingMigrationReport['rulesRequiringFinanceReview'] =
            []

        const activeRules = await this.prisma.ficoAccountDeterminationRule.findMany({
            where: { companyId, sourceModule: 'MM', status: { in: ['ACTIVE', 'APPROVED'] } },
            select: { id: true, determinationCode: true, transactionKeyCode: true, valuationClassId: true },
        })

        let successfullyTransformed = 0

        for (const [index, mapping] of mappings.entries()) {
            const canonicalKey = ficoCanonicalMmTransactionKey(mapping.transactionKeyCode)
            const catalog = ficoCatalogEntryForKey(canonicalKey)
            if (!catalog) {
                missingTransactionKeys.push({ mappingId: mapping.id, code: mapping.transactionKeyCode })
                unresolvedMappings.push({
                    mappingId: mapping.id,
                    reason: `Transaction key ${mapping.transactionKeyCode} is not in the enterprise catalogue.`,
                })
                continue
            }

            try {
                await this.postingValidation.assertAccountPostable(
                    companyId,
                    mapping.debitAccountId,
                    'AUTOMATIC',
                    (settings.baseCurrency || 'PHP').toUpperCase(),
                    settings.chartOfAccountsId,
                    new Date(postingDate),
                )
                await this.postingValidation.assertAccountPostable(
                    companyId,
                    mapping.creditAccountId,
                    'AUTOMATIC',
                    (settings.baseCurrency || 'PHP').toUpperCase(),
                    settings.chartOfAccountsId,
                    new Date(postingDate),
                )
            } catch (error) {
                const reason = error instanceof Error ? error.message : 'Invalid account.'
                invalidAccountAssignments.push({ mappingId: mapping.id, reason })
                rulesRequiringFinanceReview.push({
                    proposedDeterminationCode: this.proposedCode(mapping, index),
                    reason,
                })
                continue
            }

            const clash = activeRules.find(
                (rule) =>
                    ficoCanonicalMmTransactionKey(rule.transactionKeyCode ?? '') === canonicalKey &&
                    (rule.valuationClassId ?? null) === (mapping.valuationClassId ?? null),
            )
            if (clash) {
                conflictingRules.push({
                    mappingId: mapping.id,
                    determinationCode: clash.determinationCode,
                    reason: 'An active or approved central rule already exists for this key and valuation class.',
                })
            }

            let transactionType: string
            try {
                transactionType = ficoMmTransactionTypeForKey(canonicalKey)
            } catch {
                unresolvedMappings.push({
                    mappingId: mapping.id,
                    reason: `No MM transaction type for key ${canonicalKey}.`,
                })
                continue
            }

            const determinationCode = this.proposedCode(mapping, index)
            proposedRules.push({
                determinationCode,
                name: `Migrated ${catalog.name}${
                    mapping.valuationClass
                        ? ` · ${(mapping.valuationClass as { code: string }).code}`
                        : ''
                }`,
                description: `Migrated from legacy mapping ${mapping.id} (${mapping.transactionKeyCode}).`,
                companyId,
                sourceModule: 'MM',
                transactionType,
                transactionKeyCode: canonicalKey,
                priority: 200 + index,
                effectiveFrom: mapping.effectiveFrom?.toISOString().slice(0, 10) ?? null,
                effectiveTo: mapping.effectiveTo?.toISOString().slice(0, 10) ?? null,
                valuationClassId: mapping.valuationClassId,
                materialTypeCode: null,
                movementType: null,
                customerAccountGroup: null,
                salesOrganization: null,
                distributionChannel: null,
                lines: [
                    {
                        side: 'DEBIT',
                        glAccountId: mapping.debitAccountId,
                        description: `${canonicalKey} debit (migrated)`,
                    },
                    {
                        side: 'CREDIT',
                        glAccountId: mapping.creditAccountId,
                        description: `${canonicalKey} credit (migrated)`,
                    },
                ],
            })

            if (mapping.status !== 'ACTIVE') {
                rulesRequiringFinanceReview.push({
                    proposedDeterminationCode: determinationCode,
                    reason: 'Legacy mapping is not ACTIVE.',
                })
            } else {
                rulesReadyForActivation.push({
                    proposedDeterminationCode: determinationCode,
                    transactionKeyCode: canonicalKey,
                    valuationClassId: mapping.valuationClassId,
                })
                successfullyTransformed += 1
            }

            if (options.compareCentral && mapping.status === 'ACTIVE') {
                try {
                    resolutionDifferences.push(
                        await this.compareOne(
                            companyId,
                            postingDate,
                            settings.baseCurrency || 'PHP',
                            mapping,
                            mapping.valuationClassId,
                            canonicalKey,
                        ),
                    )
                } catch (error) {
                    const reason = error instanceof Error ? error.message : 'Comparison failed.'
                    rulesRequiringFinanceReview.push({
                        proposedDeterminationCode: determinationCode,
                        reason: `Central comparison failed: ${reason}`,
                    })
                }
            }
        }

        return {
            companyId,
            generatedAt: new Date().toISOString(),
            totalLegacyMappings: mappings.length,
            successfullyTransformed,
            missingTransactionKeys,
            invalidAccountAssignments,
            conflictingRules,
            unresolvedMappings,
            resolutionDifferences,
            rulesReadyForActivation,
            rulesRequiringFinanceReview,
            proposedRules,
            dryRun: options.dryRun,
        }
    }

    private proposedCode(
        mapping: {
            transactionKeyCode: string
            valuationClass?: { code: string } | null
        },
        index: number,
    ) {
        const key = ficoCanonicalMmTransactionKey(mapping.transactionKeyCode)
        const vc = mapping.valuationClass?.code?.replace(/[^A-Z0-9]/gi, '') ?? 'ALL'
        return `MM-MIG-${key}-${vc}-${String(index + 1).padStart(3, '0')}`.slice(0, 32)
    }

    private pickMapping<T extends {
        transactionKeyCode: string
        valuationClassId: string | null
        valuationScopeKey: string
        id: string
        debitAccountId: string
        creditAccountId: string
        valuationClass?: { code: string } | null
    }>(
        mappings: T[],
        valuationClassId: string | null,
        transactionKey: string,
    ): T | undefined {
        return mappings.find(
            (row) =>
                ficoCanonicalMmTransactionKey(row.transactionKeyCode) === transactionKey &&
                (valuationClassId
                    ? row.valuationClassId === valuationClassId
                    : row.valuationScopeKey === '*'),
        )
    }

    private async compareOne(
        companyId: string,
        postingDate: string,
        currency: string,
        mapping: {
            id: string
            debitAccountId: string
            creditAccountId: string
            valuationClass?: { code: string } | null
        },
        valuationClassId: string | null,
        transactionKey: string,
    ): Promise<MmMappingMigrationDifference> {
        let centralDebitAccountIds: string[] = []
        let centralCreditAccountIds: string[] = []
        let reason: string | undefined
        try {
            const central = await this.resolution.resolve({
                companyId,
                sourceModule: 'MM',
                transactionType: ficoMmTransactionTypeForKey(transactionKey),
                postingDate,
                currencyCode: currency,
                transactionKeyCode: transactionKey,
                valuationClassId,
            })
            centralDebitAccountIds = central.debitLines.map((line) => line.glAccountId)
            centralCreditAccountIds = central.creditLines.map((line) => line.glAccountId)
        } catch (error) {
            reason = error instanceof Error ? error.message : 'No central rule.'
        }

        const differs =
            !reason &&
            (centralDebitAccountIds[0] !== mapping.debitAccountId ||
                centralCreditAccountIds[0] !== mapping.creditAccountId)

        return {
            transactionKeyCode: transactionKey,
            valuationClassId,
            valuationClassCode: mapping.valuationClass?.code ?? null,
            legacyDebitAccountId: mapping.debitAccountId,
            legacyCreditAccountId: mapping.creditAccountId,
            centralDebitAccountIds,
            centralCreditAccountIds,
            differs: Boolean(reason) || Boolean(differs),
            reason,
        }
    }

    private lineTransactionKey(payload: MmAccountingDispatchPayload, _materialId: string) {
        if (payload.eventType === 'GoodsReceiptPosted') return 'GR_IR'
        if (payload.eventType === 'GoodsIssuePosted') {
            return payload.issuePurpose === 'SALES' ? 'GI_COGS' : 'CONSUMPTION_EXPENSE'
        }
        const effects = new Set(payload.accountingEffects)
        if (effects.has('PRICE_VARIANCE')) return 'PURCHASE_VARIANCE'
        if (effects.has('LANDED_COST')) return 'LANDED_COST'
        return 'GR_IR'
    }
}