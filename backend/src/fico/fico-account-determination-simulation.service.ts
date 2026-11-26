import { BadRequestException, Injectable } from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAccountResolutionService } from './fico-account-resolution.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import {
    flattenDeterminationDimensions,
    type AccountDeterminationDimensions,
} from './fico-account-determination.types'
import {
    ficoAssertSourceModuleSupportsKey,
    ficoCatalogEntryForKey,
    ficoResolveTransactionTypeForKey,
    ficoRuleLineSignature,
} from './fico-account-determination-policy'
import type {
    DeterminationSimulationMode,
    DeterminationSimulationResult,
} from './fico-account-determination-simulation.types'
import type { CreateDeterminationInput } from './fico-account-determination-rules.service'

export type DeterminationSimulationInput = {
    mode: DeterminationSimulationMode
    companyId: string
    postingDate: string
    sourceModule: string
    transactionKey?: string
    transactionKeys?: string[]
    transactionType?: string
    currencyCode?: string | null
    documentType?: string
    dimensions?: AccountDeterminationDimensions
    sourceDocumentType?: string
    sourceDocumentId?: string
    draftRule?: CreateDeterminationInput
}

@Injectable()
export class FicoAccountDeterminationSimulationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly resolution: FicoAccountResolutionService,
    ) {}

    async simulate(
        input: DeterminationSimulationInput,
        user: AuthRequestUser,
    ): Promise<DeterminationSimulationResult> {
        await this.access.assertAccess(user, input.companyId)
        const dimensions = await this.resolveDimensions(input)
        const postingDate = input.postingDate

        if (input.mode === 'MULTI_KEY') {
            return this.simulateMultiKey(input, dimensions, user)
        }

        const transactionKey = (input.transactionKey ?? '').trim().toUpperCase()
        if (!transactionKey && input.mode !== 'DRAFT_RULE') {
            throw new BadRequestException('A transaction key is required for simulation.')
        }

        const catalogEntry = transactionKey
            ? ficoCatalogEntryForKey(transactionKey)
            : null
        if (transactionKey && !catalogEntry) {
            throw new BadRequestException(`Unknown transaction key ${transactionKey}.`)
        }
        const sourceModule = input.sourceModule.trim().toUpperCase()
        if (catalogEntry) {
            ficoAssertSourceModuleSupportsKey(catalogEntry, sourceModule)
        }

        const transactionType =
            input.transactionType?.trim().toUpperCase() ??
            (transactionKey
                ? ficoResolveTransactionTypeForKey(
                      transactionKey,
                      sourceModule,
                      input.transactionType,
                  )
                : input.draftRule?.transactionType)

        if (!transactionType) {
            throw new BadRequestException('A transaction type is required for simulation.')
        }

        const flat = flattenDeterminationDimensions(dimensions)
        const requestCurrency =
            input.currencyCode?.trim().toUpperCase() ?? flat.currencyCode ?? null

        const trace = await this.resolution.traceCandidates({
            companyId: input.companyId,
            sourceModule,
            transactionType,
            postingDate,
            transactionKeyCode: transactionKey || input.draftRule?.transactionKeyCode,
            currencyCode: requestCurrency,
            ...flat,
        })

        let determination = null
        if (trace.resolution && !trace.configurationErrors.length) {
            try {
                determination = await this.resolution.resolveDetermination({
                    companyId: input.companyId,
                    transactionKey: transactionKey || input.draftRule!.transactionKeyCode!,
                    sourceModule,
                    postingDate,
                    currencyCode: requestCurrency,
                    transactionType,
                    dimensions,
                })
            } catch (error) {
                trace.configurationErrors.push(
                    error instanceof Error ? error.message : 'Determination failed.',
                )
            }
        }

        return {
            safeDryRun: true,
            mode: input.mode,
            companyId: input.companyId,
            chartOfAccountsId: trace.chartOfAccountsId,
            chartOfAccountsCode: trace.chartOfAccountsCode,
            sourceModule,
            postingDate,
            transactionKey: transactionKey || undefined,
            inputDimensions: this.dimensionRecord(dimensions),
            candidates: trace.candidates,
            selectedRule: trace.selected,
            resolution: trace.resolution,
            determination,
            configurationErrors: trace.configurationErrors,
            validationWarnings: trace.validationWarnings,
            draftRuleNote:
                input.mode === 'DRAFT_RULE'
                    ? 'Draft rule simulation evaluates ACTIVE production rules only. Save and activate the draft before it can win production resolution.'
                    : undefined,
        }
    }

    private async simulateMultiKey(
        input: DeterminationSimulationInput,
        dimensions: AccountDeterminationDimensions,
        user: AuthRequestUser,
    ): Promise<DeterminationSimulationResult> {
        await this.access.assertAccess(user, input.companyId)
        const keys = input.transactionKeys ?? []
        if (!keys.length) {
            throw new BadRequestException('transactionKeys is required for MULTI_KEY simulation.')
        }
        const batchItems: DeterminationSimulationResult['batchItems'] = []
        const configurationErrors: string[] = []
        const sourceModule = input.sourceModule.trim().toUpperCase()
        for (const key of keys) {
            try {
                const row = await this.simulate(
                    {
                        ...input,
                        mode: 'SINGLE_KEY',
                        transactionKey: key,
                        transactionKeys: undefined,
                    },
                    user,
                )
                batchItems.push({
                    transactionKey: key,
                    ok: !row.configurationErrors.length && !!row.determination,
                    determination: row.determination ?? undefined,
                    message: row.configurationErrors[0],
                })
                configurationErrors.push(...row.configurationErrors)
            } catch (error) {
                batchItems.push({
                    transactionKey: key,
                    ok: false,
                    message: error instanceof Error ? error.message : 'Simulation failed.',
                })
            }
        }
        const flat = flattenDeterminationDimensions(dimensions)
        const trace = await this.resolution.traceCandidates({
            companyId: input.companyId,
            sourceModule,
            transactionType:
                input.transactionType ??
                ficoResolveTransactionTypeForKey(
                    keys[0],
                    sourceModule,
                    input.transactionType,
                ),
            postingDate: input.postingDate,
            transactionKeyCode: keys[0],
            currencyCode: input.currencyCode,
            ...flat,
        })
        return {
            safeDryRun: true,
            mode: 'MULTI_KEY',
            companyId: input.companyId,
            chartOfAccountsId: trace.chartOfAccountsId,
            chartOfAccountsCode: trace.chartOfAccountsCode,
            sourceModule,
            postingDate: input.postingDate,
            transactionKeys: keys,
            inputDimensions: this.dimensionRecord(dimensions),
            candidates: trace.candidates,
            selectedRule: trace.selected,
            resolution: null,
            determination: null,
            configurationErrors: [...new Set(configurationErrors)],
            validationWarnings: [],
            batchItems,
        }
    }

    /**
     * Phase 04.26 — rule overlap / conflict analysis. Read-only: reports
     * candidate pairs that tie on precedence but target different accounts.
     */
    async analyseConflicts(
        input: { companyId: string; sourceModule?: string; transactionKeyCode?: string },
        user: AuthRequestUser,
    ) {
        await this.access.assertAccess(user, input.companyId)
        const rules = await this.prisma.ficoAccountDeterminationRule.findMany({
            where: {
                companyId: input.companyId,
                status: { in: ['ACTIVE', 'APPROVED'] },
                ...(input.sourceModule
                    ? { sourceModule: input.sourceModule.trim().toUpperCase() }
                    : {}),
                ...(input.transactionKeyCode
                    ? { transactionKeyCode: input.transactionKeyCode.trim().toUpperCase() }
                    : {}),
            },
            include: { lines: { orderBy: { lineNumber: 'asc' } } },
        })

        const conflicts: Array<{
            left: string
            right: string
            transactionType: string
            reason: string
            sameTarget: boolean
        }> = []

        const signature = (rule: (typeof rules)[number]) =>
            [
                rule.transactionKeyCode ?? '',
                rule.valuationClassId ?? '',
                rule.materialTypeCode ?? '',
                rule.movementType ?? '',
                rule.customerAccountGroup ?? '',
                rule.salesOrganization ?? '',
                rule.distributionChannel ?? '',
                rule.paymentMethodCode ?? '',
                rule.bankAccountId ?? '',
                rule.currencyCode ?? '',
                rule.branchId ?? '',
                rule.assetClassCode ?? '',
            ].join('|')

        for (let i = 0; i < rules.length; i += 1) {
            for (let j = i + 1; j < rules.length; j += 1) {
                const left = rules[i]
                const right = rules[j]
                if (left.sourceModule !== right.sourceModule) continue
                if (left.transactionType !== right.transactionType) continue
                if (signature(left) !== signature(right)) continue

                const leftFrom = left.effectiveFrom?.getTime() ?? Number.NEGATIVE_INFINITY
                const leftTo = left.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY
                const rightFrom = right.effectiveFrom?.getTime() ?? Number.NEGATIVE_INFINITY
                const rightTo = right.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY
                if (!(leftFrom <= rightTo && rightFrom <= leftTo)) continue

                const leftSig = ficoRuleLineSignature(left.lines)
                const rightSig = ficoRuleLineSignature(right.lines)
                conflicts.push({
                    left: left.determinationCode,
                    right: right.determinationCode,
                    transactionType: left.transactionType,
                    sameTarget: leftSig === rightSig,
                    reason:
                        left.priority === right.priority
                            ? leftSig === rightSig
                                ? 'Identical dimensions, overlapping dates and identical target accounts — one rule is redundant.'
                                : 'Identical dimensions and priority in overlapping dates with different target accounts — resolution is ambiguous.'
                            : 'Identical dimensions in overlapping dates; priority currently decides the winner.',
                })
            }
        }

        return {
            safeDryRun: true as const,
            companyId: input.companyId,
            examinedRules: rules.length,
            conflicts,
            ambiguous: conflicts.filter(
                (row) => !row.sameTarget && row.reason.includes('ambiguous'),
            ).length,
        }
    }

    private async resolveDimensions(
        input: DeterminationSimulationInput,
    ): Promise<AccountDeterminationDimensions> {
        if (input.mode === 'SOURCE_DOCUMENT') {
            if (!input.sourceDocumentId || !input.sourceDocumentType) {
                throw new BadRequestException(
                    'sourceDocumentId and sourceDocumentType are required for SOURCE_DOCUMENT simulation.',
                )
            }
            const event = await this.prisma.mmAccountingEvent.findFirst({
                where: {
                    companyId: input.companyId,
                    documentId: input.sourceDocumentId,
                    documentType: input.sourceDocumentType,
                },
                orderBy: { createdAt: 'desc' },
            })
            if (!event?.payload || typeof event.payload !== 'object') {
                throw new BadRequestException(
                    'No accounting event payload found for the source document.',
                )
            }
            const payload = event.payload as {
                lines?: Array<{ valuationClassId?: string; materialId?: string }>
                warehouseId?: string
            }
            const line = payload.lines?.[0]
            return {
                ...(input.dimensions ?? {}),
                valuationClassId: line?.valuationClassId ?? input.dimensions?.valuationClassId,
            }
        }
        return input.dimensions ?? {}
    }

    private dimensionRecord(dimensions: AccountDeterminationDimensions) {
        const flat = flattenDeterminationDimensions(dimensions)
        const out: Record<string, string | null> = {}
        for (const [key, value] of Object.entries(flat)) {
            out[key] = value ?? null
        }
        return out
    }
}