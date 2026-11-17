import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAuditService } from './fico-audit.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import {
    FICO_AUDIT_ACTIONS,
    FICO_COMPANY_SETTINGS_STATUSES,
    FICO_DEFAULT_ACCOUNT_SLOTS,
    FICO_PHILIPPINES_DEFAULTS,
    FICO_SETTINGS_STRUCTURAL_FIELDS,
} from './fico.constants'

export type UpsertCompanySettingsInput = {
    legalName?: string
    baseCurrency?: string
    groupCurrency?: string | null
    countryCode?: string
    timezone?: string
    accountingMethod?: string
    chartOfAccountsId?: string | null
    fiscalYearVariantId?: string | null
    postingPeriodVariantId?: string | null
    accountDeterminationProfileId?: string | null
    taxCountryCode?: string | null
    taxRegistrationNumber?: string | null
    taxJurisdiction?: string | null
    defaultTaxCode?: string | null
    defaultRetainedEarningsAccountId?: string | null
    defaultCashAccountId?: string | null
    defaultReceivableAccountId?: string | null
    defaultPayableAccountId?: string | null
    defaultInventoryAccountId?: string | null
    defaultSalesRevenueAccountId?: string | null
    defaultCostOfGoodsSoldAccountId?: string | null
    defaultTaxInputAccountId?: string | null
    defaultTaxOutputAccountId?: string | null
    documentNumberPrefix?: string
    documentNumberPadding?: number
    allowNegativePostings?: boolean
    backdatedPostingAllowed?: boolean
    maxBackdatedPostingDays?: number | null
    closeChecklist?: Record<string, unknown> | null
}

export type FicoValidationIssue = {
    code: string
    message: string
    field?: string
}

const GL_ACCOUNT_REF = {
    id: true,
    accountCode: true,
    accountName: true,
    accountType: true,
    status: true,
    chartOfAccountsId: true,
    isPostingAccount: true,
} as const

const SETTINGS_INCLUDE = {
    company: { select: { id: true, code: true, name: true, tin: true } },
    chartOfAccounts: {
        select: { id: true, code: true, name: true, status: true },
    },
    fiscalYearVariant: {
        select: { id: true, code: true, name: true, status: true },
    },
    postingPeriodVariant: {
        select: { id: true, code: true, name: true, status: true },
    },
    accountDeterminationProfile: {
        select: { id: true, code: true, name: true, status: true },
    },
    defaultRetainedEarningsAccount: { select: GL_ACCOUNT_REF },
    defaultCashAccount: { select: GL_ACCOUNT_REF },
    defaultReceivableAccount: { select: GL_ACCOUNT_REF },
    defaultPayableAccount: { select: GL_ACCOUNT_REF },
    defaultInventoryAccount: { select: GL_ACCOUNT_REF },
    defaultSalesRevenueAccount: { select: GL_ACCOUNT_REF },
    defaultCostOfGoodsSoldAccount: { select: GL_ACCOUNT_REF },
    defaultTaxInputAccount: { select: GL_ACCOUNT_REF },
    defaultTaxOutputAccount: { select: GL_ACCOUNT_REF },
} as const

@Injectable()
export class FicoCompanySettingsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly audit: FicoAuditService,
    ) {}

    defaults() {
        return {
            ...FICO_PHILIPPINES_DEFAULTS,
            status: 'DRAFT' as const,
            closeChecklist: {
                items: FICO_PHILIPPINES_DEFAULTS
                    ? [
                          'All unposted source documents reviewed',
                          'GR/IR clearing reviewed (balances alone do not block closing)',
                          'Trial balance reviewed and balanced',
                      ]
                    : [],
            },
        }
    }

    async listCompanies(user: AuthRequestUser) {
        const companies = await this.access.listAccessibleCompanies(user)
        const settings = await this.prisma.ficoCompanyAccountingSettings.findMany({
            where: { companyId: { in: companies.map((c) => c.id) } },
            include: SETTINGS_INCLUDE,
        })
        const byCompany = new Map(settings.map((s) => [s.companyId, s]))
        return companies.map((company) => ({
            company,
            settings: byCompany.get(company.id) ?? null,
            status: byCompany.get(company.id)?.status ?? 'NOT_CONFIGURED',
        }))
    }

    async get(companyId: string, user?: AuthRequestUser) {
        if (user) await this.access.assertAccess(user, companyId)
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId },
            include: SETTINGS_INCLUDE,
        })
        if (!settings) {
            throw new NotFoundException(
                'Accounting settings have not been configured for this company.',
            )
        }
        return settings
    }

    async getOrNull(companyId: string) {
        return this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId },
            include: SETTINGS_INCLUDE,
        })
    }

    async create(
        companyId: string,
        input: UpsertCompanySettingsInput,
        user: AuthRequestUser,
    ) {
        await this.access.assertAccess(user, companyId)
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, name: true, tin: true },
        })
        if (!company) throw new NotFoundException('Company not found')

        const existing = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId },
            select: { id: true },
        })
        if (existing) {
            throw new ConflictException(
                'Accounting settings already exist for this company. Update them instead.',
            )
        }

        await this.assertReferences(input)
        const data = {
            companyId,
            legalName: input.legalName?.trim() || company.name,
            baseCurrency: (input.baseCurrency || 'PHP').toUpperCase(),
            groupCurrency: input.groupCurrency?.toUpperCase() ?? null,
            countryCode: (input.countryCode || 'PH').toUpperCase(),
            timezone: input.timezone || FICO_PHILIPPINES_DEFAULTS.timezone,
            accountingMethod:
                input.accountingMethod || FICO_PHILIPPINES_DEFAULTS.accountingMethod,
            chartOfAccountsId: input.chartOfAccountsId ?? null,
            fiscalYearVariantId: input.fiscalYearVariantId ?? null,
            postingPeriodVariantId: input.postingPeriodVariantId ?? null,
            accountDeterminationProfileId:
                input.accountDeterminationProfileId ?? null,
            taxCountryCode: input.taxCountryCode?.toUpperCase() ?? null,
            taxRegistrationNumber: input.taxRegistrationNumber ?? null,
            taxJurisdiction: input.taxJurisdiction ?? null,
            defaultTaxCode: input.defaultTaxCode ?? null,
            defaultRetainedEarningsAccountId:
                input.defaultRetainedEarningsAccountId ?? null,
            defaultCashAccountId: input.defaultCashAccountId ?? null,
            defaultReceivableAccountId:
                input.defaultReceivableAccountId ?? null,
            defaultPayableAccountId: input.defaultPayableAccountId ?? null,
            defaultInventoryAccountId: input.defaultInventoryAccountId ?? null,
            defaultSalesRevenueAccountId:
                input.defaultSalesRevenueAccountId ?? null,
            defaultCostOfGoodsSoldAccountId:
                input.defaultCostOfGoodsSoldAccountId ?? null,
            defaultTaxInputAccountId: input.defaultTaxInputAccountId ?? null,
            defaultTaxOutputAccountId: input.defaultTaxOutputAccountId ?? null,
            documentNumberPrefix:
                input.documentNumberPrefix?.trim() ||
                FICO_PHILIPPINES_DEFAULTS.documentNumberPrefix,
            documentNumberPadding:
                input.documentNumberPadding ??
                FICO_PHILIPPINES_DEFAULTS.documentNumberPadding,
            allowNegativePostings: input.allowNegativePostings ?? false,
            backdatedPostingAllowed: input.backdatedPostingAllowed ?? true,
            maxBackdatedPostingDays: input.maxBackdatedPostingDays ?? null,
            closeChecklist: (input.closeChecklist ?? null) as never,
            status: 'DRAFT',
            createdBy: user.id,
            updatedBy: user.id,
        }

        this.assertScalarValues(data)
        const created = await this.prisma.$transaction(async (tx) => {
            const row = await tx.ficoCompanyAccountingSettings.create({
                data,
                include: SETTINGS_INCLUDE,
            })
            await this.audit.log(
                {
                    companyId,
                    actorId: user.id,
                    action: FICO_AUDIT_ACTIONS.COMPANY_SETTINGS_CREATE,
                    entityType: 'FicoCompanyAccountingSettings',
                    entityId: row.id,
                    newValues: row as unknown as Record<string, unknown>,
                },
                tx,
            )
            return row
        })
        return created
    }

    async update(
        companyId: string,
        input: UpsertCompanySettingsInput,
        user: AuthRequestUser,
    ) {
        await this.access.assertAccess(user, companyId)
        const current = await this.get(companyId)
        await this.assertReferences({
            ...(current as unknown as UpsertCompanySettingsInput),
            ...input,
        })

        const structuralChange = FICO_SETTINGS_STRUCTURAL_FIELDS.some((field) => {
            const next = input[field]
            return next !== undefined && next !== (current as never)[field]
        })
        if (structuralChange && current.status !== 'DRAFT') {
            throw new BadRequestException(
                'Base currency, country, timezone, accounting method, chart of accounts and fiscal variants can only be changed while the configuration is in DRAFT.',
            )
        }
        if (structuralChange) {
            const documents = await this.prisma.ficoJournalEntry.count({
                where: { companyId, status: { not: 'LEGACY' } },
            })
            if (documents > 0) {
                throw new BadRequestException(
                    'Structural accounting settings cannot change after accounting documents exist.',
                )
            }
        }

        const data = {
            ...(input.legalName !== undefined
                ? { legalName: input.legalName.trim() }
                : {}),
            ...(input.baseCurrency !== undefined
                ? { baseCurrency: input.baseCurrency.toUpperCase() }
                : {}),
            ...(input.groupCurrency !== undefined
                ? {
                      groupCurrency:
                          input.groupCurrency?.toUpperCase() ?? null,
                  }
                : {}),
            ...(input.countryCode !== undefined
                ? { countryCode: input.countryCode.toUpperCase() }
                : {}),
            ...(input.timezone !== undefined
                ? { timezone: input.timezone }
                : {}),
            ...(input.accountingMethod !== undefined
                ? { accountingMethod: input.accountingMethod }
                : {}),
            ...(input.chartOfAccountsId !== undefined
                ? { chartOfAccountsId: input.chartOfAccountsId }
                : {}),
            ...(input.fiscalYearVariantId !== undefined
                ? { fiscalYearVariantId: input.fiscalYearVariantId }
                : {}),
            ...(input.postingPeriodVariantId !== undefined
                ? { postingPeriodVariantId: input.postingPeriodVariantId }
                : {}),
            ...(input.accountDeterminationProfileId !== undefined
                ? {
                      accountDeterminationProfileId:
                          input.accountDeterminationProfileId,
                  }
                : {}),
            ...(input.taxCountryCode !== undefined
                ? {
                      taxCountryCode:
                          input.taxCountryCode?.toUpperCase() ?? null,
                  }
                : {}),
            ...(input.taxRegistrationNumber !== undefined
                ? { taxRegistrationNumber: input.taxRegistrationNumber }
                : {}),
            ...(input.taxJurisdiction !== undefined
                ? { taxJurisdiction: input.taxJurisdiction }
                : {}),
            ...(input.defaultTaxCode !== undefined
                ? { defaultTaxCode: input.defaultTaxCode }
                : {}),
            ...(input.defaultRetainedEarningsAccountId !== undefined
                ? {
                      defaultRetainedEarningsAccountId:
                          input.defaultRetainedEarningsAccountId,
                  }
                : {}),
            ...(input.defaultCashAccountId !== undefined
                ? { defaultCashAccountId: input.defaultCashAccountId }
                : {}),
            ...(input.defaultReceivableAccountId !== undefined
                ? {
                      defaultReceivableAccountId:
                          input.defaultReceivableAccountId,
                  }
                : {}),
            ...(input.defaultPayableAccountId !== undefined
                ? { defaultPayableAccountId: input.defaultPayableAccountId }
                : {}),
            ...(input.defaultInventoryAccountId !== undefined
                ? {
                      defaultInventoryAccountId:
                          input.defaultInventoryAccountId,
                  }
                : {}),
            ...(input.defaultSalesRevenueAccountId !== undefined
                ? {
                      defaultSalesRevenueAccountId:
                          input.defaultSalesRevenueAccountId,
                  }
                : {}),
            ...(input.defaultCostOfGoodsSoldAccountId !== undefined
                ? {
                      defaultCostOfGoodsSoldAccountId:
                          input.defaultCostOfGoodsSoldAccountId,
                  }
                : {}),
            ...(input.defaultTaxInputAccountId !== undefined
                ? {
                      defaultTaxInputAccountId:
                          input.defaultTaxInputAccountId,
                  }
                : {}),
            ...(input.defaultTaxOutputAccountId !== undefined
                ? {
                      defaultTaxOutputAccountId:
                          input.defaultTaxOutputAccountId,
                  }
                : {}),
            ...(input.allowNegativePostings !== undefined
                ? { allowNegativePostings: input.allowNegativePostings }
                : {}),
            ...(input.backdatedPostingAllowed !== undefined
                ? {
                      backdatedPostingAllowed:
                          input.backdatedPostingAllowed,
                  }
                : {}),
            ...(input.maxBackdatedPostingDays !== undefined
                ? {
                      maxBackdatedPostingDays:
                          input.maxBackdatedPostingDays,
                  }
                : {}),
            ...(input.documentNumberPrefix !== undefined
                ? { documentNumberPrefix: input.documentNumberPrefix.trim() }
                : {}),
            ...(input.documentNumberPadding !== undefined
                ? { documentNumberPadding: input.documentNumberPadding }
                : {}),
            ...(input.closeChecklist !== undefined
                ? { closeChecklist: input.closeChecklist as never }
                : {}),
            updatedBy: user.id,
        }

        this.assertScalarValues({ ...current, ...data })
        const updated = await this.prisma.$transaction(async (tx) => {
            const row = await tx.ficoCompanyAccountingSettings.update({
                where: { companyId },
                data,
                include: SETTINGS_INCLUDE,
            })
            await this.audit.log(
                {
                    companyId,
                    actorId: user.id,
                    action: FICO_AUDIT_ACTIONS.COMPANY_SETTINGS_UPDATE,
                    entityType: 'FicoCompanyAccountingSettings',
                    entityId: row.id,
                    previousValues: current as unknown as Record<
                        string,
                        unknown
                    >,
                    newValues: row as unknown as Record<string, unknown>,
                },
                tx,
            )
            return row
        })
        return updated
    }

    async validate(companyId: string, user?: AuthRequestUser) {
        if (user) await this.access.assertAccess(user, companyId)
        const settings = await this.getOrNull(companyId)
        const errors: FicoValidationIssue[] = []
        const warnings: FicoValidationIssue[] = []

        if (!settings) {
            return {
                companyId,
                valid: false,
                errors: [
                    {
                        code: 'SETTINGS_MISSING',
                        message:
                            'Accounting settings have not been configured for this company.',
                    },
                ],
                warnings,
                checkedAt: new Date().toISOString(),
            }
        }

        this.collectScalarErrors(settings, errors)

        if (!settings.chartOfAccountsId) {
            errors.push({
                code: 'COA_MISSING',
                field: 'chartOfAccountsId',
                message: 'A chart of accounts is required.',
            })
        } else if (!settings.chartOfAccounts) {
            errors.push({
                code: 'COA_NOT_FOUND',
                field: 'chartOfAccountsId',
                message: 'The assigned chart of accounts no longer exists.',
            })
        } else if (settings.chartOfAccounts.status !== 'ACTIVE') {
            errors.push({
                code: 'COA_INACTIVE',
                field: 'chartOfAccountsId',
                message: 'The assigned chart of accounts is inactive.',
            })
        }

        if (!settings.fiscalYearVariantId) {
            errors.push({
                code: 'FISCAL_VARIANT_MISSING',
                field: 'fiscalYearVariantId',
                message: 'A fiscal year variant is required.',
            })
        } else if (!settings.fiscalYearVariant) {
            errors.push({
                code: 'FISCAL_VARIANT_NOT_FOUND',
                field: 'fiscalYearVariantId',
                message: 'The assigned fiscal year variant no longer exists.',
            })
        } else if (settings.fiscalYearVariant.status !== 'ACTIVE') {
            errors.push({
                code: 'FISCAL_VARIANT_INACTIVE',
                field: 'fiscalYearVariantId',
                message: 'The assigned fiscal year variant is inactive.',
            })
        }

        if (!settings.postingPeriodVariantId) {
            errors.push({
                code: 'POSTING_VARIANT_MISSING',
                field: 'postingPeriodVariantId',
                message: 'A posting period variant is required.',
            })
        } else if (!settings.postingPeriodVariant) {
            errors.push({
                code: 'POSTING_VARIANT_NOT_FOUND',
                field: 'postingPeriodVariantId',
                message: 'The assigned posting period variant no longer exists.',
            })
        } else if (settings.postingPeriodVariant.status !== 'ACTIVE') {
            errors.push({
                code: 'POSTING_VARIANT_INACTIVE',
                field: 'postingPeriodVariantId',
                message: 'The assigned posting period variant is inactive.',
            })
        }

        if (settings.chartOfAccountsId) {
            const postingAccounts = await this.prisma.ficoGlAccount.count({
                where: {
                    chartOfAccountsId: settings.chartOfAccountsId,
                    status: 'ACTIVE',
                    isPostingAccount: true,
                },
            })
            if (postingAccounts === 0) {
                errors.push({
                    code: 'NO_POSTING_ACCOUNTS',
                    message:
                        'The chart of accounts must contain at least one active posting account.',
                })
            }

            const assignments = await this.prisma.ficoCompanyGlAccount.count({
                where: { companyId, postingEnabled: true },
            })
            if (assignments === 0) {
                warnings.push({
                    code: 'NO_COMPANY_ACCOUNTS',
                    message:
                        'No G/L accounts are enabled for this company yet. Journal posting will fail until accounts are assigned.',
                })
            }
        }

        for (const slot of FICO_DEFAULT_ACCOUNT_SLOTS) {
            const accountId = settings[slot.key] as string | null
            const account = settings[slot.relation] as {
                id: string
                accountCode: string
                accountName: string
                accountType: string
                status: string
                chartOfAccountsId: string
                isPostingAccount: boolean
            } | null
            if (!accountId) {
                warnings.push({
                    code: 'DEFAULT_ACCOUNT_MISSING',
                    field: slot.key,
                    message: `${slot.label} is not configured. Automatic defaulting that uses this slot will be unavailable.`,
                })
                continue
            }
            if (!account) {
                errors.push({
                    code: 'DEFAULT_ACCOUNT_NOT_FOUND',
                    field: slot.key,
                    message: `${slot.label}: the selected G/L account no longer exists.`,
                })
                continue
            }
            if (
                settings.chartOfAccountsId &&
                account.chartOfAccountsId !== settings.chartOfAccountsId
            ) {
                errors.push({
                    code: 'DEFAULT_ACCOUNT_WRONG_CHART',
                    field: slot.key,
                    message: `${slot.label}: G/L account ${account.accountCode} does not belong to the assigned chart of accounts.`,
                })
            }
            if (account.status !== 'ACTIVE') {
                errors.push({
                    code: 'DEFAULT_ACCOUNT_INACTIVE',
                    field: slot.key,
                    message: `${slot.label}: G/L account ${account.accountCode} is inactive.`,
                })
            }
            if (!account.isPostingAccount) {
                errors.push({
                    code: 'DEFAULT_ACCOUNT_NOT_POSTING',
                    field: slot.key,
                    message: `${slot.label}: G/L account ${account.accountCode} is not a posting account.`,
                })
            }
            if (account.accountType !== slot.expectedType) {
                warnings.push({
                    code: 'DEFAULT_ACCOUNT_TYPE',
                    field: slot.key,
                    message: `${slot.label}: G/L account ${account.accountCode} is ${account.accountType}; expected ${slot.expectedType}.`,
                })
            }
        }

        if (!settings.accountDeterminationProfileId) {
            warnings.push({
                code: 'NO_DETERMINATION_PROFILE',
                message:
                    'No automatic account determination profile is assigned. Automatic MM postings will not resolve.',
            })
        }

        const fiscalYears = await this.prisma.ficoFinancialPeriod.count({
            where: { companyId },
        })
        if (fiscalYears === 0) {
            warnings.push({
                code: 'NO_FISCAL_PERIODS',
                message:
                    'No fiscal periods have been generated. Generate the fiscal year before posting.',
            })
        }

        return {
            companyId,
            valid: errors.length === 0,
            errors,
            warnings,
            checkedAt: new Date().toISOString(),
        }
    }

    async activate(companyId: string, user: AuthRequestUser) {
        await this.access.assertAccess(user, companyId)
        const current = await this.get(companyId)
        if (current.status === 'ACTIVE') {
            throw new BadRequestException('Accounting settings are already active.')
        }
        const result = await this.validate(companyId)
        if (!result.valid) {
            throw new BadRequestException(
                `Accounting settings cannot be activated: ${result.errors
                    .map((e) => e.message)
                    .join(' ')}`,
            )
        }
        const now = new Date()
        const updated = await this.prisma.$transaction(async (tx) => {
            const row = await tx.ficoCompanyAccountingSettings.update({
                where: { companyId },
                data: {
                    status: 'ACTIVE',
                    activatedAt: now,
                    activatedBy: user.id,
                    deactivatedAt: null,
                    deactivatedBy: null,
                    updatedBy: user.id,
                },
                include: SETTINGS_INCLUDE,
            })
            await this.audit.log(
                {
                    companyId,
                    actorId: user.id,
                    action: FICO_AUDIT_ACTIONS.COMPANY_SETTINGS_ACTIVATE,
                    entityType: 'FicoCompanyAccountingSettings',
                    entityId: current.id,
                    previousValues: { status: current.status },
                    newValues: { status: row.status },
                    metadata: { warnings: result.warnings },
                },
                tx,
            )
            return row
        })
        return updated
    }

    async deactivate(
        companyId: string,
        user: AuthRequestUser,
        reason?: string,
    ) {
        await this.access.assertAccess(user, companyId)
        const current = await this.get(companyId)
        if (current.status !== 'ACTIVE') {
            throw new BadRequestException(
                'Only an active accounting configuration can be deactivated.',
            )
        }
        const updated = await this.prisma.$transaction(async (tx) => {
            const row = await tx.ficoCompanyAccountingSettings.update({
                where: { companyId },
                data: {
                    status: 'INACTIVE',
                    deactivatedAt: new Date(),
                    deactivatedBy: user.id,
                    updatedBy: user.id,
                },
                include: SETTINGS_INCLUDE,
            })
            await this.audit.log(
                {
                    companyId,
                    actorId: user.id,
                    action: FICO_AUDIT_ACTIONS.COMPANY_SETTINGS_DEACTIVATE,
                    entityType: 'FicoCompanyAccountingSettings',
                    entityId: current.id,
                    previousValues: { status: current.status },
                    newValues: { status: row.status },
                    reason,
                },
                tx,
            )
            return row
        })
        return updated
    }

    /**
     * Only an unused DRAFT configuration may be removed. Activated
     * configurations and any configuration referenced by accounting documents
     * are retained for auditability.
     */
    async remove(
        companyId: string,
        user: AuthRequestUser,
        reason?: string,
    ) {
        await this.access.assertAccess(user, companyId)
        const current = await this.get(companyId)
        if (current.status === 'ACTIVE') {
            throw new BadRequestException(
                'Deactivate the accounting configuration before deleting it.',
            )
        }
        const [documents, periods] = await Promise.all([
            this.prisma.ficoJournalEntry.count({ where: { companyId } }),
            this.prisma.ficoFinancialPeriod.count({ where: { companyId } }),
        ])
        if (documents > 0) {
            throw new ConflictException(
                'The accounting configuration cannot be deleted because accounting documents reference this company.',
            )
        }
        if (periods > 0) {
            throw new ConflictException(
                'The accounting configuration cannot be deleted because accounting periods have already been generated for this company.',
            )
        }
        await this.prisma.$transaction(async (tx) => {
            await this.audit.log(
                {
                    companyId,
                    actorId: user.id,
                    action: FICO_AUDIT_ACTIONS.COMPANY_SETTINGS_DELETE,
                    entityType: 'FicoCompanyAccountingSettings',
                    entityId: current.id,
                    previousValues: current as unknown as Record<
                        string,
                        unknown
                    >,
                    reason,
                },
                tx,
            )
            await tx.ficoCompanyAccountingSettings.delete({
                where: { companyId },
            })
        })
        return { companyId, deleted: true }
    }

    private assertScalarValues(input: {
        baseCurrency?: string
        groupCurrency?: string | null
        countryCode?: string
        accountingMethod?: string
        documentNumberPadding?: number
        maxBackdatedPostingDays?: number | null
        status?: string
    }) {
        if (input.baseCurrency && !/^[A-Z]{3}$/.test(input.baseCurrency)) {
            throw new BadRequestException(
                'Base currency must be a three-letter ISO code.',
            )
        }
        if (
            input.groupCurrency !== undefined &&
            input.groupCurrency !== null &&
            !/^[A-Z]{3}$/.test(input.groupCurrency)
        ) {
            throw new BadRequestException(
                'Group currency must be a three-letter ISO code.',
            )
        }
        if (input.countryCode && !/^[A-Z]{2}$/.test(input.countryCode)) {
            throw new BadRequestException(
                'Country code must be a two-letter ISO code.',
            )
        }
        if (
            input.accountingMethod &&
            !['ACCRUAL', 'CASH'].includes(input.accountingMethod)
        ) {
            throw new BadRequestException(
                'Accounting method must be ACCRUAL or CASH.',
            )
        }
        if (
            input.documentNumberPadding !== undefined &&
            (input.documentNumberPadding < 3 || input.documentNumberPadding > 12)
        ) {
            throw new BadRequestException(
                'Document number padding must be between 3 and 12.',
            )
        }
        if (
            input.maxBackdatedPostingDays !== undefined &&
            input.maxBackdatedPostingDays !== null &&
            (input.maxBackdatedPostingDays < 0 ||
                input.maxBackdatedPostingDays > 3650)
        ) {
            throw new BadRequestException(
                'Maximum backdated posting days must be between 0 and 3650.',
            )
        }
        if (
            input.status &&
            !(FICO_COMPANY_SETTINGS_STATUSES as readonly string[]).includes(
                input.status,
            )
        ) {
            throw new BadRequestException('Invalid accounting configuration status.')
        }
    }

    private collectScalarErrors(
        settings: {
            baseCurrency: string
            groupCurrency?: string | null
            countryCode: string
            timezone: string
            accountingMethod: string
            documentNumberPadding: number
            maxBackdatedPostingDays?: number | null
        },
        errors: FicoValidationIssue[],
    ) {
        if (!/^[A-Z]{3}$/.test(settings.baseCurrency || '')) {
            errors.push({
                code: 'CURRENCY_INVALID',
                field: 'baseCurrency',
                message: 'Base currency must be a three-letter ISO code.',
            })
        }
        if (
            settings.groupCurrency &&
            !/^[A-Z]{3}$/.test(settings.groupCurrency)
        ) {
            errors.push({
                code: 'GROUP_CURRENCY_INVALID',
                field: 'groupCurrency',
                message: 'Group currency must be a three-letter ISO code.',
            })
        }
        if (!/^[A-Z]{2}$/.test(settings.countryCode || '')) {
            errors.push({
                code: 'COUNTRY_INVALID',
                field: 'countryCode',
                message: 'Country code must be a two-letter ISO code.',
            })
        }
        if (!settings.timezone?.trim()) {
            errors.push({
                code: 'TIMEZONE_MISSING',
                field: 'timezone',
                message: 'A company timezone is required.',
            })
        }
        if (!['ACCRUAL', 'CASH'].includes(settings.accountingMethod)) {
            errors.push({
                code: 'METHOD_INVALID',
                field: 'accountingMethod',
                message: 'Accounting method must be ACCRUAL or CASH.',
            })
        }
        if (
            settings.documentNumberPadding < 3 ||
            settings.documentNumberPadding > 12
        ) {
            errors.push({
                code: 'PADDING_INVALID',
                field: 'documentNumberPadding',
                message: 'Document number padding must be between 3 and 12.',
            })
        }
        if (
            settings.maxBackdatedPostingDays !== null &&
            settings.maxBackdatedPostingDays !== undefined &&
            (settings.maxBackdatedPostingDays < 0 ||
                settings.maxBackdatedPostingDays > 3650)
        ) {
            errors.push({
                code: 'BACKDATED_DAYS_INVALID',
                field: 'maxBackdatedPostingDays',
                message:
                    'Maximum backdated posting days must be between 0 and 3650.',
            })
        }
    }

    private async assertReferences(input: UpsertCompanySettingsInput) {
        if (input.chartOfAccountsId) {
            const chart = await this.prisma.ficoChartOfAccounts.findUnique({
                where: { id: input.chartOfAccountsId },
                select: { id: true },
            })
            if (!chart) {
                throw new BadRequestException('Chart of accounts not found.')
            }
        }
        const defaultAccountIds = FICO_DEFAULT_ACCOUNT_SLOTS.map(
            (slot) => input[slot.key] as string | null | undefined,
        ).filter((id): id is string => Boolean(id))
        if (defaultAccountIds.length > 0) {
            if (!input.chartOfAccountsId) {
                throw new BadRequestException(
                    'Assign a chart of accounts before selecting default G/L accounts.',
                )
            }
            const accounts = await this.prisma.ficoGlAccount.findMany({
                where: { id: { in: [...new Set(defaultAccountIds)] } },
                select: {
                    id: true,
                    accountCode: true,
                    chartOfAccountsId: true,
                    status: true,
                    isPostingAccount: true,
                },
            })
            const byId = new Map(accounts.map((account) => [account.id, account]))
            for (const slot of FICO_DEFAULT_ACCOUNT_SLOTS) {
                const id = input[slot.key] as string | null | undefined
                if (!id) continue
                const account = byId.get(id)
                if (!account) {
                    throw new BadRequestException(
                        `${slot.label}: G/L account not found.`,
                    )
                }
                if (account.chartOfAccountsId !== input.chartOfAccountsId) {
                    throw new BadRequestException(
                        `${slot.label}: G/L account ${account.accountCode} does not belong to the assigned chart of accounts.`,
                    )
                }
                if (account.status !== 'ACTIVE') {
                    throw new BadRequestException(
                        `${slot.label}: G/L account ${account.accountCode} is inactive.`,
                    )
                }
                if (!account.isPostingAccount) {
                    throw new BadRequestException(
                        `${slot.label}: G/L account ${account.accountCode} is not a posting account.`,
                    )
                }
            }
        }
        if (input.fiscalYearVariantId) {
            const variant = await this.prisma.ficoFiscalYearVariant.findUnique({
                where: { id: input.fiscalYearVariantId },
                select: { id: true },
            })
            if (!variant) {
                throw new BadRequestException('Fiscal year variant not found.')
            }
        }
        if (input.postingPeriodVariantId) {
            const variant = await this.prisma.ficoPostingPeriodVariant.findUnique({
                where: { id: input.postingPeriodVariantId },
                select: { id: true },
            })
            if (!variant) {
                throw new BadRequestException('Posting period variant not found.')
            }
        }
        if (input.accountDeterminationProfileId) {
            const profile =
                await this.prisma.ficoAccountDeterminationProfile.findUnique({
                    where: { id: input.accountDeterminationProfileId },
                    select: { id: true },
                })
            if (!profile) {
                throw new BadRequestException(
                    'Account determination profile not found.',
                )
            }
        }
    }
}
