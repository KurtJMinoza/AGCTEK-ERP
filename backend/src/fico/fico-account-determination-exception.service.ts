import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { ficoResolveMmTransactionKey } from './fico-mm-inventory-determination.policy'
import { ficoCatalogEntryForKey } from './fico-account-determination-policy'
import { FICO_TRANSACTION_KEY_CATALOG } from './fico-transaction-key.catalog'
import { summarizeAccountingError } from './fico-accounting-events.service'
import { FICO_DETERMINATION_ERROR_CODES } from './fico-determination-error'

/**
 * Phase 04.25 — configuration exception categories. Every category maps to a
 * single expected handling path so Finance can act without reading logs.
 */
export const FICO_DETERMINATION_EXCEPTION_CATEGORIES = {
    MISSING_TRANSACTION_KEY: 'MISSING_TRANSACTION_KEY',
    MISSING_DETERMINATION_RULE: 'MISSING_DETERMINATION_RULE',
    AMBIGUOUS_RULE: 'AMBIGUOUS_RULE',
    EXPIRED_RULE: 'EXPIRED_RULE',
    INVALID_GL_ACCOUNT: 'INVALID_GL_ACCOUNT',
    BLOCKED_GL_ACCOUNT: 'BLOCKED_GL_ACCOUNT',
    INVALID_COMPANY_ASSIGNMENT: 'INVALID_COMPANY_ASSIGNMENT',
    MISSING_REQUIRED_DIMENSION: 'MISSING_REQUIRED_DIMENSION',
    UNSUPPORTED_SCENARIO: 'UNSUPPORTED_SCENARIO',
    LEGACY_MIGRATION_DISCREPANCY: 'LEGACY_MIGRATION_DISCREPANCY',
    FAILED_AUTOMATIC_POSTING: 'FAILED_AUTOMATIC_POSTING',
} as const

export type FicoDeterminationExceptionCategory =
    (typeof FICO_DETERMINATION_EXCEPTION_CATEGORIES)[keyof typeof FICO_DETERMINATION_EXCEPTION_CATEGORIES]

export const FICO_DETERMINATION_EXCEPTION_HANDLING: Record<
    FicoDeterminationExceptionCategory,
    string
> = {
    MISSING_TRANSACTION_KEY: 'Configuration review',
    MISSING_DETERMINATION_RULE: 'Create approved rule',
    AMBIGUOUS_RULE: 'Resolve conflict',
    EXPIRED_RULE: 'Review validity',
    INVALID_GL_ACCOUNT: 'Correct account assignment',
    BLOCKED_GL_ACCOUNT: 'Review account restrictions',
    INVALID_COMPANY_ASSIGNMENT: 'Correct configuration',
    MISSING_REQUIRED_DIMENSION: 'Correct source master data',
    UNSUPPORTED_SCENARIO: 'Block unsupported posting',
    LEGACY_MIGRATION_DISCREPANCY: 'Review migration',
    FAILED_AUTOMATIC_POSTING: 'Investigate and retry',
}

export type FicoDeterminationException = {
    id: string
    category: FicoDeterminationExceptionCategory
    expectedHandling: string
    companyId: string | null
    sourceModule: string | null
    sourceDocumentType: string | null
    sourceDocumentId: string | null
    accountingEventId: string | null
    transactionKey: string | null
    resolutionContext: Record<string, unknown>
    errorCode: string | null
    errorDescription: string | null
    firstFailureAt: string | null
    lastFailureAt: string | null
    retryCount: number
    resolutionStatus: 'OPEN' | 'RETRYABLE' | 'BLOCKED' | 'RESOLVED'
    /** Authorized deep link to the configuration that must be corrected. */
    configurationLink: string | null
}

export type ExceptionQuery = {
    companyId: string
    category?: string
    page?: number
    pageSize?: number
}

/** Event error codes that indicate a determination/configuration problem. */
const CONFIG_ERROR_CODES = new Set(['DETERMINATION', 'VALIDATION', 'CONFLICT'])

@Injectable()
export class FicoAccountDeterminationExceptionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
    ) {}

    async list(
        query: ExceptionQuery,
        user: AuthRequestUser,
    ): Promise<{
        items: FicoDeterminationException[]
        total: number
        page: number
        pageSize: number
        byCategory: Record<string, number>
    }> {
        if (!query.companyId) {
            throw new BadRequestException('companyId is required.')
        }
        await this.access.assertAccess(user, query.companyId)

        const [eventExceptions, configExceptions] = await Promise.all([
            this.eventExceptions(query.companyId),
            this.configurationExceptions(query.companyId),
        ])

        let items = [...eventExceptions, ...configExceptions]
        if (query.category) {
            const category = query.category.trim().toUpperCase()
            items = items.filter((row) => row.category === category)
        }

        const byCategory: Record<string, number> = {}
        for (const row of items) {
            byCategory[row.category] = (byCategory[row.category] ?? 0) + 1
        }

        const page = Math.max(1, query.page ?? 1)
        const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50))
        const total = items.length
        const start = (page - 1) * pageSize

        return {
            items: items.slice(start, start + pageSize),
            total,
            page,
            pageSize,
            byCategory,
        }
    }

    /** Failed or outstanding automatic postings, classified by stored error. */
    private async eventExceptions(
        companyId: string,
    ): Promise<FicoDeterminationException[]> {
        const events = await this.prisma.mmAccountingEvent.findMany({
            where: {
                companyId,
                status: { in: ['PENDING', 'FAILED'] },
                NOT: { lastErrorCode: null },
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
            select: {
                id: true,
                eventType: true,
                sourceModule: true,
                documentType: true,
                documentId: true,
                companyId: true,
                status: true,
                payload: true,
                lastError: true,
                lastErrorCode: true,
                attemptCount: true,
                createdAt: true,
                lastAttemptAt: true,
            },
        })

        return events.map((event) => {
            const transactionKey = this.transactionKeyOf(event)
            const category = this.classify(
                event.lastErrorCode,
                event.lastError,
                transactionKey,
            )
            const payload = (event.payload ?? {}) as Record<string, unknown>
            return {
                id: `EVENT:${event.id}`,
                category,
                expectedHandling: FICO_DETERMINATION_EXCEPTION_HANDLING[category],
                companyId: event.companyId,
                sourceModule: event.sourceModule,
                sourceDocumentType: event.documentType,
                sourceDocumentId: event.documentId,
                accountingEventId: event.id,
                transactionKey,
                resolutionContext: {
                    eventType: event.eventType,
                    status: event.status,
                    valuationClassId:
                        (payload.lines as Array<Record<string, unknown>> | undefined)?.[0]
                            ?.valuationClassId ?? null,
                    warehouseId: payload.warehouseId ?? null,
                    currencyCode: payload.currencyCode ?? null,
                    postingDate: payload.postingDate ?? null,
                },
                errorCode: event.lastErrorCode,
                errorDescription: summarizeAccountingError(event.lastError),
                firstFailureAt: event.createdAt.toISOString(),
                lastFailureAt: event.lastAttemptAt?.toISOString() ?? null,
                retryCount: event.attemptCount,
                resolutionStatus: event.status === 'FAILED' ? 'BLOCKED' : 'RETRYABLE',
                configurationLink: '/modules/fico/account-determination',
            }
        })
    }

    /** Static configuration defects that will fail the next posting. */
    private async configurationExceptions(
        companyId: string,
    ): Promise<FicoDeterminationException[]> {
        const out: FicoDeterminationException[] = []
        const now = new Date()

        const [settings, rules, legacyMappings] = await Promise.all([
            this.prisma.ficoCompanyAccountingSettings.findUnique({
                where: { companyId },
                select: {
                    status: true,
                    chartOfAccountsId: true,
                    accountDeterminationProfileId: true,
                },
            }),
            this.prisma.ficoAccountDeterminationRule.findMany({
                where: { companyId, status: { in: ['ACTIVE', 'APPROVED'] } },
                select: {
                    id: true,
                    determinationCode: true,
                    status: true,
                    sourceModule: true,
                    transactionKeyCode: true,
                    effectiveTo: true,
                    updatedAt: true,
                    lines: {
                        select: {
                            glAccountId: true,
                            glAccount: {
                                select: {
                                    accountCode: true,
                                    accountType: true,
                                    status: true,
                                    isPostingAccount: true,
                                    allowAutomaticPosting: true,
                                    chartOfAccountsId: true,
                                    companyAssignments: {
                                        where: { companyId },
                                        select: { id: true },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.ficoMmAccountMapping.count({
                where: { companyId, status: 'ACTIVE' },
            }),
        ])

        if (!settings?.accountDeterminationProfileId || settings.status !== 'ACTIVE') {
            out.push(
                this.configRow({
                    id: `CONFIG:PROFILE:${companyId}`,
                    category: 'INVALID_COMPANY_ASSIGNMENT',
                    companyId,
                    errorCode: !settings?.accountDeterminationProfileId
                        ? FICO_DETERMINATION_ERROR_CODES.DETERMINATION_MISSING
                        : FICO_DETERMINATION_ERROR_CODES.COMPANY_ACCOUNTING_INACTIVE,
                    errorDescription: !settings?.accountDeterminationProfileId
                        ? 'No active account determination profile is assigned to this company.'
                        : `Company accounting configuration is ${settings?.status ?? 'missing'}.`,
                    configurationLink: '/modules/fico/company-settings',
                }),
            )
        }
        if (!settings?.chartOfAccountsId) {
            out.push(
                this.configRow({
                    id: `CONFIG:COA:${companyId}`,
                    category: 'INVALID_COMPANY_ASSIGNMENT',
                    companyId,
                    errorCode: FICO_DETERMINATION_ERROR_CODES.COA_NOT_ASSIGNED,
                    errorDescription: 'No chart of accounts is assigned to this company.',
                    configurationLink: '/modules/fico/company-settings',
                }),
            )
        }

        for (const rule of rules) {
            if (rule.effectiveTo && rule.effectiveTo < now) {
                out.push(
                    this.configRow({
                        id: `CONFIG:EXPIRED:${rule.id}`,
                        category: 'EXPIRED_RULE',
                        companyId,
                        sourceModule: rule.sourceModule,
                        transactionKey: rule.transactionKeyCode,
                        errorCode: FICO_DETERMINATION_ERROR_CODES.DETERMINATION_EXPIRED,
                        errorDescription: `Rule ${rule.determinationCode} expired on ${rule.effectiveTo
                            .toISOString()
                            .slice(0, 10)} and can no longer resolve accounts.`,
                        lastFailureAt: rule.updatedAt.toISOString(),
                    }),
                )
            }
            for (const line of rule.lines) {
                const account = line.glAccount
                if (!account) continue
                if (account.status !== 'ACTIVE') {
                    out.push(
                        this.configRow({
                            id: `CONFIG:BLOCKED:${rule.id}:${line.glAccountId}`,
                            category: 'BLOCKED_GL_ACCOUNT',
                            companyId,
                            sourceModule: rule.sourceModule,
                            transactionKey: rule.transactionKeyCode,
                            errorCode: FICO_DETERMINATION_ERROR_CODES.ACCOUNT_BLOCKED,
                            errorDescription: `Rule ${rule.determinationCode} targets ${account.accountCode}, which is ${account.status}.`,
                        }),
                    )
                } else if (!account.isPostingAccount || !account.allowAutomaticPosting) {
                    out.push(
                        this.configRow({
                            id: `CONFIG:NOTPOSTABLE:${rule.id}:${line.glAccountId}`,
                            category: 'INVALID_GL_ACCOUNT',
                            companyId,
                            sourceModule: rule.sourceModule,
                            transactionKey: rule.transactionKeyCode,
                            errorCode: FICO_DETERMINATION_ERROR_CODES.ACCOUNT_NOT_POSTABLE,
                            errorDescription: `Rule ${rule.determinationCode} targets ${account.accountCode}, which does not allow automatic posting.`,
                        }),
                    )
                }
                if (!account.companyAssignments.length) {
                    out.push(
                        this.configRow({
                            id: `CONFIG:NOCOMPANY:${rule.id}:${line.glAccountId}`,
                            category: 'INVALID_COMPANY_ASSIGNMENT',
                            companyId,
                            sourceModule: rule.sourceModule,
                            transactionKey: rule.transactionKeyCode,
                            errorCode:
                                FICO_DETERMINATION_ERROR_CODES.ACCOUNT_COMPANY_MISMATCH,
                            errorDescription: `Account ${account.accountCode} used by ${rule.determinationCode} is not assigned to this company.`,
                            configurationLink: '/modules/fico/gl-accounts',
                        }),
                    )
                }
                if (
                    settings?.chartOfAccountsId &&
                    account.chartOfAccountsId !== settings.chartOfAccountsId
                ) {
                    out.push(
                        this.configRow({
                            id: `CONFIG:COAMISMATCH:${rule.id}:${line.glAccountId}`,
                            category: 'INVALID_GL_ACCOUNT',
                            companyId,
                            sourceModule: rule.sourceModule,
                            transactionKey: rule.transactionKeyCode,
                            errorCode: FICO_DETERMINATION_ERROR_CODES.ACCOUNT_COMPANY_MISMATCH,
                            errorDescription: `Account ${account.accountCode} belongs to a different chart of accounts.`,
                            configurationLink: '/modules/fico/gl-accounts',
                        }),
                    )
                }
            }
        }

        const liveKeys = FICO_TRANSACTION_KEY_CATALOG.filter(
            (entry) => entry.integrationStatus === 'LIVE',
        )
        const coveredKeys = new Set(
            rules
                .filter((rule) => rule.status === 'ACTIVE')
                .map((rule) => rule.transactionKeyCode)
                .filter((code): code is string => !!code),
        )
        for (const entry of liveKeys) {
            if (!coveredKeys.has(entry.code)) {
                out.push(
                    this.configRow({
                        id: `CONFIG:NORULE:${entry.code}`,
                        category: 'MISSING_DETERMINATION_RULE',
                        companyId,
                        sourceModule: entry.owningModule,
                        transactionKey: entry.code,
                        errorCode: FICO_DETERMINATION_ERROR_CODES.DETERMINATION_MISSING,
                        errorDescription: `No active rule covers live transaction key ${entry.code} (${entry.name}).`,
                    }),
                )
            }
        }

        if (legacyMappings > 0 && coveredKeys.size === 0) {
            out.push(
                this.configRow({
                    id: `CONFIG:LEGACY:${companyId}`,
                    category: 'LEGACY_MIGRATION_DISCREPANCY',
                    companyId,
                    errorCode: FICO_DETERMINATION_ERROR_CODES.DETERMINATION_MISSING,
                    errorDescription: `${legacyMappings} legacy MM mappings exist with no centralized rules. Run the migration dry-run and activate centralized rules.`,
                }),
            )
        }

        return out
    }

    private configRow(input: {
        id: string
        category: FicoDeterminationExceptionCategory
        companyId: string
        sourceModule?: string | null
        transactionKey?: string | null
        errorCode: string
        errorDescription: string
        lastFailureAt?: string | null
        configurationLink?: string
    }): FicoDeterminationException {
        return {
            id: input.id,
            category: input.category,
            expectedHandling: FICO_DETERMINATION_EXCEPTION_HANDLING[input.category],
            companyId: input.companyId,
            sourceModule: input.sourceModule ?? null,
            sourceDocumentType: null,
            sourceDocumentId: null,
            accountingEventId: null,
            transactionKey: input.transactionKey ?? null,
            resolutionContext: {},
            errorCode: input.errorCode,
            errorDescription: input.errorDescription,
            firstFailureAt: null,
            lastFailureAt: input.lastFailureAt ?? null,
            retryCount: 0,
            resolutionStatus: 'OPEN',
            configurationLink:
                input.configurationLink ?? '/modules/fico/account-determination',
        }
    }

    private transactionKeyOf(event: {
        eventType: string
        documentType: string
        payload: Prisma.JsonValue
    }): string | null {
        try {
            return ficoResolveMmTransactionKey(event as never)
        } catch {
            return null
        }
    }

    private classify(
        errorCode: string | null,
        errorText: string | null,
        transactionKey: string | null,
    ): FicoDeterminationExceptionCategory {
        const text = (errorText ?? '').toLowerCase()
        if (!transactionKey || !ficoCatalogEntryForKey(transactionKey)) {
            return FICO_DETERMINATION_EXCEPTION_CATEGORIES.MISSING_TRANSACTION_KEY
        }
        // Order matters: the broadest "missing configuration" phrasing also
        // contains words like "blocked", so it is matched first.
        if (text.includes('ambiguous') || text.includes('conflicting')) {
            return FICO_DETERMINATION_EXCEPTION_CATEGORIES.AMBIGUOUS_RULE
        }
        if (text.includes('expired')) {
            return FICO_DETERMINATION_EXCEPTION_CATEGORIES.EXPIRED_RULE
        }
        if (
            text.includes('determination profile') ||
            text.includes('no approved, active and effective') ||
            text.includes('no active centralized') ||
            text.includes('no centralized or legacy') ||
            text.includes('could not resolve any debit/credit lines')
        ) {
            return FICO_DETERMINATION_EXCEPTION_CATEGORIES.MISSING_DETERMINATION_RULE
        }
        if (text.includes('not enabled for source module')) {
            return FICO_DETERMINATION_EXCEPTION_CATEGORIES.UNSUPPORTED_SCENARIO
        }
        if (text.includes('requires valuationclass') || text.includes('dimension')) {
            return FICO_DETERMINATION_EXCEPTION_CATEGORIES.MISSING_REQUIRED_DIMENSION
        }
        if (
            text.includes('does not belong to the company chart of accounts') ||
            text.includes('not assigned to')
        ) {
            return FICO_DETERMINATION_EXCEPTION_CATEGORIES.INVALID_COMPANY_ASSIGNMENT
        }
        if (
            text.includes('g/l account') &&
            (text.includes('inactive') || text.includes('blocked'))
        ) {
            return FICO_DETERMINATION_EXCEPTION_CATEGORIES.BLOCKED_GL_ACCOUNT
        }
        if (text.includes('g/l account') || text.includes('account type')) {
            return FICO_DETERMINATION_EXCEPTION_CATEGORIES.INVALID_GL_ACCOUNT
        }
        if (
            errorCode &&
            CONFIG_ERROR_CODES.has(errorCode) &&
            text.includes('determination')
        ) {
            return FICO_DETERMINATION_EXCEPTION_CATEGORIES.MISSING_DETERMINATION_RULE
        }
        return FICO_DETERMINATION_EXCEPTION_CATEGORIES.FAILED_AUTOMATIC_POSTING
    }
}