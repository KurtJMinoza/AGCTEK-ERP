import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common'
import { FicoAccountingDeterminationException } from './fico-accounting-determination.exception'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import type {
    MmAccountingDispatchPayload,
    MmAccountingLineContext,
} from '../mm/common/mm-accounting-event.types'
import { FicoPostingValidationService } from './fico-posting-validation.service'
import { FicoAccountResolutionService } from './fico-account-resolution.service'
import type { FicoMmResolutionMode } from './fico-mm-resolution-mode.constants'
import {
    ficoMmEventReversesPostingDirection,
    ficoMmTransactionTypeForKey,
    ficoResolveMmTransactionKey,
} from './fico-mm-inventory-determination.policy'
import { ficoTransactionKeyLookupCodes } from './fico-phase02-enterprise-keys.policy'
import {
    companyDefaultForMmPair,
    loadCompanyGlDefaults,
} from './fico-company-gl-defaults'

/**
 * Transaction keys `transactionKey()` below can return. Other keys (e.g. supplier
 * invoice) may have mappings, but no MM event resolves to them yet.
 */
export const FICO_RESOLVED_TRANSACTION_KEYS = [
    'GR_IR',
    'GI_COGS',
    'CONSUMPTION_EXPENSE',
    'GI_EXPENSE',
    'INVENTORY_LOSS',
    'INVENTORY_SHRINKAGE',
    'INVENTORY_GAIN',
    'INVENTORY_INCREASE_ADJ',
    'INVENTORY_WRITEOFF',
    'INVENTORY_REVALUATION',
    'LANDED_COST',
    'FREIGHT_CLEARING',
    'PURCHASE_VARIANCE',
    'PRICE_VARIANCE',
] as const

/** Flat journal line candidates from MM account determination (central or legacy). */
export type ResolvedMmPostingLine = {
    glAccountId: string
    debitAmount: Decimal
    creditAmount: Decimal
    description: string
    materialId: string
    warehouseId?: string | null
    transactionKey: string
    resolutionSource: 'CENTRAL_RULE' | 'LEGACY_MAPPING'
    accountDeterminationRuleId?: string | null
    shadowCompared?: boolean
    shadowMismatch?: boolean
}

/** @deprecated Use ResolvedMmPostingLine — kept for transitional typing in tests. */
export type ResolvedMmJournalLine = {
    debitAccountId: string
    creditAccountId: string
    amount: Decimal
    materialId: string
    warehouseId?: string | null
    transactionKey: string
}

type CompanyAccountingContext = {
    chartOfAccountsId: string
    accountDeterminationProfileId: string
    mmResolutionMode: FicoMmResolutionMode
    mmLegacyFallbackUntil: Date | null
}

/**
 * MM adapter: centralized rules + controlled legacy migration (Phase 04.07–04.12).
 * Does not post journals — returns resolved G/L lines only.
 */
@Injectable()
export class FicoAccountDeterminationService {
    private readonly logger = new Logger(FicoAccountDeterminationService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly postingValidation: FicoPostingValidationService,
        @Optional()
        private readonly accountResolution?: FicoAccountResolutionService,
    ) {}

    async resolveMmPosting(
        payload: MmAccountingDispatchPayload,
    ): Promise<ResolvedMmPostingLine[]> {
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
            throw new FicoAccountingDeterminationException(
                'Automatic accounting is blocked because no active account determination profile is assigned.',
            )
        }

        const postingDate = new Date(payload.postingDate)
        if (Number.isNaN(postingDate.getTime())) {
            throw new BadRequestException('Automatic accounting requires a valid posting date.')
        }
        const transactionKey = this.transactionKey(payload)
        const currency = payload.currencyCode.trim().toUpperCase()

        const mmSettings = settings as typeof settings & {
            mmResolutionMode?: string
            mmLegacyFallbackUntil?: Date | null
        }
        const context: CompanyAccountingContext = {
            chartOfAccountsId: settings.chartOfAccountsId,
            accountDeterminationProfileId: settings.accountDeterminationProfileId,
            mmResolutionMode:
                (mmSettings.mmResolutionMode as FicoMmResolutionMode) ??
                'CENTRAL_WITH_LEGACY_FALLBACK',
            mmLegacyFallbackUntil: mmSettings.mmLegacyFallbackUntil ?? null,
        }

        const mode = context.mmResolutionMode
        const shadowModes = ['SHADOW_LEGACY_AUTHORITY', 'SHADOW_CENTRAL_AUTHORITY']

        const central = await this.tryCentralRules(
            payload,
            postingDate,
            currency,
            transactionKey,
        )

        let legacy: ResolvedMmPostingLine[] | null = null
        if (shadowModes.includes(mode)) {
            legacy = await this.resolveLegacyMappings(
                payload,
                context,
                postingDate,
                transactionKey,
            ).catch(() => null)
        } else if (
            mode !== 'CENTRAL_ONLY' &&
            (!central?.length || mode === 'CENTRAL_WITH_TIMED_FALLBACK')
        ) {
            legacy = await this.resolveLegacyMappings(
                payload,
                context,
                postingDate,
                transactionKey,
            ).catch((error) => {
                if (mode === 'CENTRAL_WITH_TIMED_FALLBACK' && central?.length) {
                    return null
                }
                if (context.mmResolutionMode === 'CENTRAL_ONLY') {
                    throw error
                }
                return null
            })
        }

        let chosen: ResolvedMmPostingLine[] | null = null

        if (shadowModes.includes(mode)) {
            await this.logShadow(payload, transactionKey, central, legacy)
            chosen =
                mode === 'SHADOW_CENTRAL_AUTHORITY'
                    ? central ?? legacy
                    : legacy ?? central
            if (chosen) {
                chosen = chosen.map((line) => ({
                    ...line,
                    shadowCompared: true,
                    shadowMismatch: this.shadowMismatch(central, legacy),
                }))
            }
        } else if (mode === 'CENTRAL_ONLY') {
            if (!central?.length) {
                throw new FicoAccountingDeterminationException(
                    `No active centralized account determination rule matches MM ${transactionKey}. Legacy fallback is disabled (CENTRAL_ONLY).`,
                )
            }
            chosen = central
        } else if (mode === 'CENTRAL_WITH_TIMED_FALLBACK') {
            if (central?.length) {
                chosen = central
            } else if (
                context.mmLegacyFallbackUntil &&
                new Date() > context.mmLegacyFallbackUntil
            ) {
                throw new BadRequestException(
                    `Legacy MM mapping fallback expired on ${context.mmLegacyFallbackUntil.toISOString()}. Activate centralized rules for ${transactionKey}.`,
                )
            } else {
                if (!legacy?.length) {
                    throw new FicoAccountingDeterminationException(
                        `No centralized or legacy account determination for ${transactionKey}.`,
                    )
                }
                this.logger.warn(
                    `MM legacy fallback used for ${transactionKey} (company ${payload.companyId}, mode=${mode}).`,
                )
                chosen = legacy
            }
        } else {
            chosen = central ?? legacy
        }

        if (!chosen?.length) {
            const companyFallback = await this.resolveCompanyDefaultMmLines(
                payload,
                transactionKey,
            )
            if (companyFallback?.length) {
                this.logger.warn(
                    `MM company GL defaults used for ${transactionKey} (company ${payload.companyId}).`,
                )
                chosen = companyFallback
            } else {
                throw new BadRequestException(
                    `No account determination configuration matches MM ${transactionKey}.`,
                )
            }
        }

        if (ficoMmEventReversesPostingDirection(payload)) {
            chosen = chosen.map((line) => ({
                ...line,
                debitAmount: line.creditAmount,
                creditAmount: line.debitAmount,
                description: `Reversal · ${line.description}`,
            }))
        }

        await this.validateResolvedAccounts(
            payload.companyId,
            postingDate,
            currency,
            chosen,
        )
        return chosen
    }

    private shadowMismatch(
        central: ResolvedMmPostingLine[] | null,
        legacy: ResolvedMmPostingLine[] | null,
    ) {
        if (!central?.length || !legacy?.length) return true
        const centralAccounts = [...central.map((line) => line.glAccountId)].sort().join(',')
        const legacyAccounts = [...legacy.map((line) => line.glAccountId)].sort().join(',')
        return centralAccounts !== legacyAccounts
    }

    private async logShadow(
        payload: MmAccountingDispatchPayload,
        transactionKey: string,
        central: ResolvedMmPostingLine[] | null,
        legacy: ResolvedMmPostingLine[] | null,
    ) {
        const mismatch = this.shadowMismatch(central, legacy)
        this.logger.log(
            JSON.stringify({
                type: 'MM_ACCOUNT_DETERMINATION_SHADOW',
                companyId: payload.companyId,
                eventType: payload.eventType,
                transactionKey,
                centralRuleIds: [
                    ...new Set(central?.map((line) => line.accountDeterminationRuleId)),
                ],
                centralAccounts: central?.map((line) => line.glAccountId),
                legacyAccounts: legacy?.map((line) => line.glAccountId),
                mismatch,
            }),
        )
    }

    private async validateResolvedAccounts(
        companyId: string,
        postingDate: Date,
        currency: string,
        lines: ResolvedMmPostingLine[],
    ) {
        const uniqueAccounts = [...new Set(lines.map((line) => line.glAccountId))]
        await this.postingValidation.validate({
            companyId,
            postingDate,
            source: 'AUTOMATIC',
            currencyCode: currency,
            lines: uniqueAccounts.map((glAccountId) => ({
                glAccountId,
                currency,
            })),
        })
    }

    private async resolveLegacyMappings(
        payload: MmAccountingDispatchPayload,
        context: CompanyAccountingContext,
        postingDate: Date,
        transactionKey: string,
    ): Promise<ResolvedMmPostingLine[]> {
        const mappings = await this.prisma.ficoMmAccountMapping.findMany({
            where: {
                companyId: payload.companyId,
                profileId: context.accountDeterminationProfileId,
                transactionKeyCode: { in: ficoTransactionKeyLookupCodes(transactionKey) },
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

        const resolved: ResolvedMmPostingLine[] = []
        for (const line of payload.lines) {
            const amount = new Decimal(line.totalCost ?? 0).abs()
            if (amount.isZero()) continue
            const mapping = this.mappingForLine(mappings, line)
            if (!mapping) {
                throw new BadRequestException(
                    `No active ${transactionKey} account mapping exists for the material valuation class.`,
                )
            }
            resolved.push(
                {
                    glAccountId: mapping.debitAccountId,
                    debitAmount: amount,
                    creditAmount: new Decimal(0),
                    description: transactionKey,
                    materialId: line.materialId,
                    warehouseId: line.warehouseId,
                    transactionKey,
                    resolutionSource: 'LEGACY_MAPPING',
                    accountDeterminationRuleId: null,
                },
                {
                    glAccountId: mapping.creditAccountId,
                    debitAmount: new Decimal(0),
                    creditAmount: amount,
                    description: transactionKey,
                    materialId: line.materialId,
                    warehouseId: line.warehouseId,
                    transactionKey,
                    resolutionSource: 'LEGACY_MAPPING',
                    accountDeterminationRuleId: null,
                },
            )
        }
        if (!resolved.length) {
            throw new BadRequestException(
                'Automatic accounting requires at least one non-zero valued source line.',
            )
        }
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
    ): Promise<ResolvedMmPostingLine[] | null> {
        if (!this.accountResolution) return null
        const transactionType = this.mmTransactionType(payload)
        const resolved: ResolvedMmPostingLine[] = []
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
                if (result.lines.length > 2) {
                    throw new BadRequestException(
                        `Determination rule ${result.rule.determinationCode} has ${result.lines.length} lines. MM automatic posting supports two-line rules only; use SD composition or split amounts in the operational module.`,
                    )
                }
                if (
                    result.lines.some((row) => row.side !== 'DEBIT' && row.side !== 'CREDIT')
                ) {
                    throw new BadRequestException(
                        `Determination rule ${result.rule.determinationCode} contains invalid line sides.`,
                    )
                }
                for (const ruleLine of result.lines) {
                    resolved.push({
                        glAccountId: ruleLine.glAccountId,
                        debitAmount:
                            ruleLine.side === 'DEBIT' ? amount : new Decimal(0),
                        creditAmount:
                            ruleLine.side === 'CREDIT' ? amount : new Decimal(0),
                        description: ruleLine.description ?? result.rule.determinationCode,
                        materialId: line.materialId,
                        warehouseId: line.warehouseId,
                        transactionKey,
                        resolutionSource: 'CENTRAL_RULE',
                        accountDeterminationRuleId: result.rule.id,
                    })
                }
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
        const key = this.transactionKey(payload)
        return ficoMmTransactionTypeForKey(key)
    }

    private transactionKey(payload: MmAccountingDispatchPayload) {
        try {
            return ficoResolveMmTransactionKey(payload)
        } catch {
            throw new FicoAccountingDeterminationException(
                `No automatic account-determination transaction key is defined for ${payload.eventType}.`,
            )
        }
    }

    private async resolveCompanyDefaultMmLines(
        payload: MmAccountingDispatchPayload,
        transactionKey: string,
    ): Promise<ResolvedMmPostingLine[] | null> {
        const defaults = await loadCompanyGlDefaults(this.prisma, payload.companyId)
        const pair = companyDefaultForMmPair(defaults, transactionKey)
        if (!pair) return null

        const resolved: ResolvedMmPostingLine[] = []
        for (const line of payload.lines) {
            const amount = new Decimal(line.totalCost ?? 0).abs()
            if (amount.isZero()) continue
            resolved.push(
                {
                    glAccountId: pair.debitAccountId,
                    debitAmount: amount,
                    creditAmount: new Decimal(0),
                    description: `${transactionKey} · COGS`,
                    materialId: line.materialId,
                    warehouseId: line.warehouseId,
                    transactionKey,
                    resolutionSource: 'LEGACY_MAPPING',
                },
                {
                    glAccountId: pair.creditAccountId,
                    debitAmount: new Decimal(0),
                    creditAmount: amount,
                    description: `${transactionKey} · inventory`,
                    materialId: line.materialId,
                    warehouseId: line.warehouseId,
                    transactionKey,
                    resolutionSource: 'LEGACY_MAPPING',
                },
            )
        }
        return resolved.length ? resolved : null
    }
}
