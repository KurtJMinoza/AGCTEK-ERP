import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '@prisma/client'
import { FicoAuditService } from './fico-audit.service'
import {
    assertAccountCodeFormat,
    formatAccountCodeRange,
    isCodeInRange,
    normalizeAccountCode,
} from './fico-coa-rules'
import { FicoCompanyAccessService } from './fico-company-access.service'
import {
    FICO_ACCOUNT_TYPES,
    FICO_AUDIT_ACTIONS,
    FICO_NORMAL_BALANCES,
    FICO_RECONCILIATION_TYPES,
    isFicoAccountType,
} from './fico.constants'

export type GlAccountListQuery = {
    chartOfAccountsId?: string
    accountType?: string
    status?: string
    search?: string
    companyId?: string
}

export type CreateGlAccountInput = {
    chartOfAccountsId: string
    accountGroupId: string
    accountCode: string
    accountName: string
    description?: string
    accountType: string
    normalBalance?: string
    isPostingAccount?: boolean
    allowManualPosting?: boolean
    allowAutomaticPosting?: boolean
    isReconciliationAccount?: boolean
    reconciliationType?: string | null
    openItemManagement?: boolean
    currencyRestriction?: string | null
}

export type UpdateGlAccountInput = Partial<Omit<CreateGlAccountInput, 'chartOfAccountsId' | 'accountCode'>> & {
    status?: string
}

export type CompanyAssignmentInput = {
    postingEnabled: boolean
    manualPostingBlocked?: boolean
    effectiveFrom?: string | null
    effectiveTo?: string | null
}

export type GlAccountImportRow = Omit<
    CreateGlAccountInput,
    'chartOfAccountsId' | 'accountGroupId' | 'accountType'
> & {
    accountGroupCode: string
    /** Defaults to the group category. */
    accountType?: string
}

export type GlAccountImportInput = {
    chartOfAccountsId: string
    rows: GlAccountImportRow[]
    dryRun?: boolean
}

export type GlAccountImportRowStatus =
    | 'CREATE'
    | 'DUPLICATE_EXISTING'
    | 'DUPLICATE_IN_FILE'
    | 'ERROR'

export type GlAccountImportReport = {
    chartOfAccountsId: string
    dryRun: boolean
    committed: boolean
    summary: Record<GlAccountImportRowStatus, number> & { total: number }
    rows: {
        rowNumber: number
        accountCode: string
        status: GlAccountImportRowStatus
        message?: string
    }[]
}

export const FICO_GL_IMPORT_MAX_ROWS = 1000

type ChartForAccount = { id: string; status: string; accountCodeLength: number | null }

type GroupForAccount = {
    id: string
    code: string
    category: string
    status: string
    rangeFrom: string | null
    rangeTo: string | null
}

function defaultNormalBalance(accountType: string) {
    return accountType === 'ASSET' || accountType === 'EXPENSE'
        ? 'DEBIT'
        : 'CREDIT'
}

function normalizeCurrency(value: string | null | undefined) {
    if (value === undefined || value === null || value.trim() === '') return null
    const currency = value.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) {
        throw new BadRequestException(
            'Currency restriction must be a three-letter ISO code.',
        )
    }
    return currency
}

function toDate(value: string | null | undefined) {
    if (value === undefined || value === null || value === '') return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('Invalid effective date.')
    }
    return date
}

@Injectable()
export class FicoGlAccountsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly audit: FicoAuditService,
    ) {}

    async list(query: GlAccountListQuery = {}) {
        const search = query.search?.trim()
        const accounts = await this.prisma.ficoGlAccount.findMany({
            where: {
                ...(query.chartOfAccountsId
                    ? { chartOfAccountsId: query.chartOfAccountsId }
                    : {}),
                ...(query.accountType
                    ? { accountType: query.accountType }
                    : {}),
                ...(query.status ? { status: query.status } : {}),
                ...(search
                    ? {
                          OR: [
                              {
                                  accountCode: {
                                      contains: search,
                                      mode: 'insensitive',
                                  },
                              },
                              {
                                  accountName: {
                                      contains: search,
                                      mode: 'insensitive',
                                  },
                              },
                          ],
                      }
                    : {}),
                ...(query.companyId
                    ? {
                          companyAssignments: {
                              some: { companyId: query.companyId },
                          },
                      }
                    : {}),
            },
            include: {
                chartOfAccounts: {
                    select: { id: true, code: true, name: true },
                },
                accountGroup: {
                    select: { id: true, code: true, name: true, category: true },
                },
                _count: {
                    select: {
                        journalLines: true,
                        debitMappings: true,
                        creditMappings: true,
                        companyAssignments: true,
                    },
                },
            },
            orderBy: [{ accountCode: 'asc' }],
        })
        return accounts.map((account) => ({
            ...account,
            usage: {
                journalLines: account._count.journalLines,
                debitMappings: account._count.debitMappings,
                creditMappings: account._count.creditMappings,
                companyAssignments: account._count.companyAssignments,
                total:
                    account._count.journalLines +
                    account._count.debitMappings +
                    account._count.creditMappings,
            },
        }))
    }

    async get(id: string) {
        const account = await this.prisma.ficoGlAccount.findUnique({
            where: { id },
            include: {
                chartOfAccounts: true,
                accountGroup: true,
                companyAssignments: {
                    include: {
                        company: {
                            select: { id: true, code: true, name: true },
                        },
                    },
                },
                _count: {
                    select: {
                        journalLines: true,
                        debitMappings: true,
                        creditMappings: true,
                    },
                },
            },
        })
        if (!account) throw new NotFoundException('G/L account not found')
        return {
            ...account,
            usage: {
                journalLines: account._count.journalLines,
                debitMappings: account._count.debitMappings,
                creditMappings: account._count.creditMappings,
                total:
                    account._count.journalLines +
                    account._count.debitMappings +
                    account._count.creditMappings,
            },
        }
    }

    async create(input: CreateGlAccountInput, user: AuthRequestUser) {
        const chart = await this.loadChart(input.chartOfAccountsId)
        const group = await this.prisma.ficoGlAccountGroup.findFirst({
            where: {
                id: input.accountGroupId,
                chartOfAccountsId: input.chartOfAccountsId,
            },
        })
        if (!group) {
            throw new BadRequestException(
                'The selected account group does not belong to this chart of accounts.',
            )
        }
        const data = this.buildAccountData(input, chart, group, user)
        const duplicate = await this.prisma.ficoGlAccount.findUnique({
            where: {
                chartOfAccountsId_accountCode: {
                    chartOfAccountsId: input.chartOfAccountsId,
                    accountCode: data.accountCode,
                },
            },
            select: { id: true },
        })
        if (duplicate) {
            throw new ConflictException(
                'An account with this code already exists in the chart.',
            )
        }

        const created = await this.prisma.ficoGlAccount.create({ data })
        await this.audit.log({
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.GL_ACCOUNT_CREATE,
            entityType: 'FicoGlAccount',
            entityId: created.id,
            newValues: created as unknown as Record<string, unknown>,
        })
        return created
    }

    /**
     * Validates every row with the same rules as `create`. Existing codes are
     * reported and skipped (never overwritten); any error or in-file duplicate
     * blocks the whole import, so a committed import is all-or-nothing.
     */
    async importAccounts(
        input: GlAccountImportInput,
        user: AuthRequestUser,
    ): Promise<GlAccountImportReport> {
        if (input.rows.length === 0) {
            throw new BadRequestException('The import file contains no accounts.')
        }
        if (input.rows.length > FICO_GL_IMPORT_MAX_ROWS) {
            throw new BadRequestException(
                `An import can contain at most ${FICO_GL_IMPORT_MAX_ROWS} accounts.`,
            )
        }
        const chart = await this.loadChart(input.chartOfAccountsId)
        const [groups, existing] = await Promise.all([
            this.prisma.ficoGlAccountGroup.findMany({
                where: { chartOfAccountsId: chart.id },
            }),
            this.prisma.ficoGlAccount.findMany({
                where: { chartOfAccountsId: chart.id },
                select: { accountCode: true },
            }),
        ])
        const groupByCode = new Map(groups.map((group) => [group.code, group]))
        const existingCodes = new Set(existing.map((row) => row.accountCode))
        const seenInFile = new Map<string, number>()

        const report: GlAccountImportReport = {
            chartOfAccountsId: chart.id,
            dryRun: input.dryRun ?? true,
            committed: false,
            summary: {
                total: input.rows.length,
                CREATE: 0,
                DUPLICATE_EXISTING: 0,
                DUPLICATE_IN_FILE: 0,
                ERROR: 0,
            },
            rows: [],
        }
        const toCreate: Prisma.FicoGlAccountUncheckedCreateInput[] = []

        input.rows.forEach((row, index) => {
            const rowNumber = index + 1
            const accountCode = normalizeAccountCode(row.accountCode ?? '')
            const push = (
                status: GlAccountImportRowStatus,
                message?: string,
            ) => {
                report.summary[status] += 1
                report.rows.push({ rowNumber, accountCode, status, message })
            }
            const firstRow = seenInFile.get(accountCode)
            if (accountCode && firstRow) {
                push('DUPLICATE_IN_FILE', `Same code as row ${firstRow}.`)
                return
            }
            if (accountCode) seenInFile.set(accountCode, rowNumber)
            if (existingCodes.has(accountCode)) {
                push('DUPLICATE_EXISTING', 'Already in the chart; left unchanged.')
                return
            }
            const group = groupByCode.get(
                normalizeAccountCode(row.accountGroupCode ?? ''),
            )
            if (!group) {
                push(
                    'ERROR',
                    `Account group ${row.accountGroupCode || '(blank)'} does not exist in this chart.`,
                )
                return
            }
            try {
                toCreate.push(
                    this.buildAccountData(
                        {
                            ...row,
                            chartOfAccountsId: chart.id,
                            accountGroupId: group.id,
                            accountType: row.accountType || group.category,
                        },
                        chart,
                        group,
                        user,
                    ),
                )
                push('CREATE')
            } catch (error) {
                push(
                    'ERROR',
                    error instanceof Error ? error.message : 'Invalid account.',
                )
            }
        })

        const blocked = report.summary.ERROR + report.summary.DUPLICATE_IN_FILE
        if (report.dryRun) return report
        if (blocked > 0) {
            throw new BadRequestException({
                message: `The import has ${blocked} invalid row(s); nothing was imported. Fix them and try again.`,
                report,
            })
        }
        if (toCreate.length === 0) return report

        try {
            await this.prisma.$transaction(async (tx) => {
                for (const data of toCreate) {
                    const created = await tx.ficoGlAccount.create({ data })
                    await this.audit.log(
                        {
                            actorId: user.id,
                            action: FICO_AUDIT_ACTIONS.GL_ACCOUNT_CREATE,
                            entityType: 'FicoGlAccount',
                            entityId: created.id,
                            newValues: created as unknown as Record<string, unknown>,
                            metadata: { source: 'IMPORT' },
                        },
                        tx,
                    )
                }
                await this.audit.log(
                    {
                        actorId: user.id,
                        action: FICO_AUDIT_ACTIONS.GL_ACCOUNT_IMPORT,
                        entityType: 'FicoChartOfAccounts',
                        entityId: chart.id,
                        newValues: report.summary as unknown as Record<string, unknown>,
                    },
                    tx,
                )
            })
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException(
                    'Another user added one of these account codes during the import. Run the import again.',
                )
            }
            throw error
        }
        report.committed = true
        return report
    }

    async update(
        id: string,
        input: UpdateGlAccountInput,
        user: AuthRequestUser,
    ) {
        const current = await this.get(id)
        const nextType = input.accountType ?? current.accountType
        if (!isFicoAccountType(nextType)) {
            throw new BadRequestException('Invalid G/L account type.')
        }
        const structuralChange =
            (input.accountType !== undefined &&
                input.accountType !== current.accountType) ||
            (input.accountGroupId !== undefined &&
                input.accountGroupId !== current.accountGroupId)
        if (structuralChange && current.usage.journalLines > 0) {
            throw new BadRequestException(
                'The account type or group cannot change after journal entries have used this account.',
            )
        }

        let groupId = current.accountGroupId
        if (input.accountGroupId !== undefined) {
            const group = await this.prisma.ficoGlAccountGroup.findFirst({
                where: {
                    id: input.accountGroupId,
                    chartOfAccountsId: current.chartOfAccountsId,
                },
            })
            if (!group) {
                throw new BadRequestException(
                    'The selected account group does not belong to this chart of accounts.',
                )
            }
            if (group.category !== nextType) {
                throw new BadRequestException(
                    `The account type must match the group category (${group.category}).`,
                )
            }
            if (!isCodeInRange(current.accountCode, group)) {
                throw new BadRequestException(
                    `Account ${current.accountCode} is outside group ${group.code} range (${formatAccountCodeRange(group)}).`,
                )
            }
            groupId = group.id
        }

        const isReconciliation =
            input.isReconciliationAccount ?? current.isReconciliationAccount
        const openItemManagement =
            input.openItemManagement ?? current.openItemManagement
        if (openItemManagement && !isReconciliation) {
            throw new BadRequestException(
                'Open-item management requires a reconciliation account.',
            )
        }
        const reconciliationType = this.reconciliationType(
            isReconciliation,
            input.reconciliationType ?? current.reconciliationType,
        )
        const isPostingAccount =
            input.isPostingAccount ?? current.isPostingAccount

        const updated = await this.prisma.ficoGlAccount.update({
            where: { id },
            data: {
                ...(input.accountGroupId !== undefined
                    ? { accountGroupId: groupId }
                    : {}),
                ...(input.accountName !== undefined
                    ? { accountName: input.accountName.trim() }
                    : {}),
                ...(input.description !== undefined
                    ? { description: input.description.trim() }
                    : {}),
                ...(input.accountType !== undefined
                    ? { accountType: input.accountType }
                    : {}),
                ...(input.normalBalance !== undefined
                    ? { normalBalance: input.normalBalance }
                    : {}),
                ...(input.isPostingAccount !== undefined
                    ? {
                          isPostingAccount,
                          ...(isPostingAccount
                              ? {}
                              : {
                                    allowManualPosting: false,
                                    allowAutomaticPosting: false,
                                }),
                      }
                    : {}),
                ...(input.allowManualPosting !== undefined
                    ? {
                          allowManualPosting: isPostingAccount
                              ? input.allowManualPosting
                              : false,
                      }
                    : {}),
                ...(input.allowAutomaticPosting !== undefined
                    ? {
                          allowAutomaticPosting: isPostingAccount
                              ? input.allowAutomaticPosting
                              : false,
                      }
                    : {}),
                ...(input.isReconciliationAccount !== undefined
                    ? { isReconciliationAccount: isReconciliation }
                    : {}),
                ...(input.reconciliationType !== undefined ||
                input.isReconciliationAccount !== undefined
                    ? { reconciliationType }
                    : {}),
                ...(input.openItemManagement !== undefined
                    ? { openItemManagement }
                    : {}),
                ...(input.currencyRestriction !== undefined
                    ? {
                          currencyRestriction: normalizeCurrency(
                              input.currencyRestriction,
                          ),
                      }
                    : {}),
                ...(input.status !== undefined ? { status: input.status } : {}),
                updatedBy: user.id,
            },
        })
        await this.audit.log({
            actorId: user.id,
            action:
                input.status !== undefined && input.status !== current.status
                    ? FICO_AUDIT_ACTIONS.GL_ACCOUNT_STATUS_CHANGE
                    : FICO_AUDIT_ACTIONS.GL_ACCOUNT_UPDATE,
            entityType: 'FicoGlAccount',
            entityId: id,
            previousValues: current as unknown as Record<string, unknown>,
            newValues: updated as unknown as Record<string, unknown>,
        })
        return updated
    }

    async remove(id: string, user: AuthRequestUser) {
        const account = await this.get(id)
        if (account.usage.total > 0 || account.companyAssignments.length > 0) {
            throw new ConflictException(
                'This account is used by journals, mappings or company assignments. Deactivate it instead of deleting it.',
            )
        }
        await this.prisma.ficoGlAccount.delete({ where: { id } })
        await this.audit.log({
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.GL_ACCOUNT_DELETE,
            entityType: 'FicoGlAccount',
            entityId: id,
            previousValues: account as unknown as Record<string, unknown>,
        })
        return { id, deleted: true }
    }

    async listCompanyAssignments(companyId: string, user: AuthRequestUser) {
        await this.access.assertAccess(user, companyId)
        return this.prisma.ficoCompanyGlAccount.findMany({
            where: { companyId },
            include: {
                glAccount: {
                    include: {
                        accountGroup: {
                            select: {
                                id: true,
                                code: true,
                                name: true,
                                category: true,
                            },
                        },
                    },
                },
            },
            orderBy: { glAccount: { accountCode: 'asc' } },
        })
    }

    async upsertCompanyAssignment(
        glAccountId: string,
        companyId: string,
        input: CompanyAssignmentInput,
        user: AuthRequestUser,
    ) {
        await this.access.assertAccess(user, companyId)
        const account = await this.prisma.ficoGlAccount.findUnique({
            where: { id: glAccountId },
            select: { id: true, chartOfAccountsId: true, status: true },
        })
        if (!account) throw new NotFoundException('G/L account not found')
        if (account.status !== 'ACTIVE') {
            throw new BadRequestException(
                'Only an active G/L account can be assigned to a company.',
            )
        }
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId },
            select: { chartOfAccountsId: true },
        })
        if (
            settings?.chartOfAccountsId &&
            settings.chartOfAccountsId !== account.chartOfAccountsId
        ) {
            throw new BadRequestException(
                'The account belongs to a different chart of accounts than the company configuration.',
            )
        }
        const effectiveFrom = toDate(input.effectiveFrom)
        const effectiveTo = toDate(input.effectiveTo)
        if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
            throw new BadRequestException(
                'The assignment end date cannot be before its start date.',
            )
        }
        const existing = await this.prisma.ficoCompanyGlAccount.findUnique({
            where: { companyId_glAccountId: { companyId, glAccountId } },
        })
        const saved = await this.prisma.ficoCompanyGlAccount.upsert({
            where: { companyId_glAccountId: { companyId, glAccountId } },
            create: {
                companyId,
                glAccountId,
                postingEnabled: input.postingEnabled,
                manualPostingBlocked: input.manualPostingBlocked ?? false,
                effectiveFrom,
                effectiveTo,
                createdBy: user.id,
                updatedBy: user.id,
            },
            update: {
                postingEnabled: input.postingEnabled,
                manualPostingBlocked: input.manualPostingBlocked ?? false,
                effectiveFrom,
                effectiveTo,
                updatedBy: user.id,
            },
        })
        await this.audit.log({
            companyId,
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.COMPANY_GL_ASSIGNMENT_UPSERT,
            entityType: 'FicoCompanyGlAccount',
            entityId: saved.id,
            previousValues: existing as unknown as Record<string, unknown> | null,
            newValues: saved as unknown as Record<string, unknown>,
        })
        return saved
    }

    async removeCompanyAssignment(
        glAccountId: string,
        companyId: string,
        user: AuthRequestUser,
    ) {
        await this.access.assertAccess(user, companyId)
        const existing = await this.prisma.ficoCompanyGlAccount.findUnique({
            where: { companyId_glAccountId: { companyId, glAccountId } },
        })
        if (!existing) {
            throw new NotFoundException('Company account assignment not found')
        }
        await this.prisma.ficoCompanyGlAccount.delete({
            where: { id: existing.id },
        })
        await this.audit.log({
            companyId,
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.COMPANY_GL_ASSIGNMENT_DELETE,
            entityType: 'FicoCompanyGlAccount',
            entityId: existing.id,
            previousValues: existing as unknown as Record<string, unknown>,
        })
        return { id: existing.id, deleted: true }
    }

    private async loadChart(chartOfAccountsId: string): Promise<ChartForAccount> {
        const chart = await this.prisma.ficoChartOfAccounts.findUnique({
            where: { id: chartOfAccountsId },
            select: { id: true, status: true, accountCodeLength: true },
        })
        if (!chart) throw new NotFoundException('Chart of accounts not found')
        if (chart.status !== 'ACTIVE') {
            throw new BadRequestException(
                'Accounts can only be added to an active chart of accounts.',
            )
        }
        return chart
    }

    /** Validation shared by single create and import; throws on the first violation. */
    private buildAccountData(
        input: CreateGlAccountInput,
        chart: ChartForAccount,
        group: GroupForAccount,
        user: AuthRequestUser,
    ): Prisma.FicoGlAccountUncheckedCreateInput {
        if (!isFicoAccountType(input.accountType)) {
            throw new BadRequestException('Invalid G/L account type.')
        }
        if (group.status !== 'ACTIVE') {
            throw new BadRequestException(
                'Accounts can only be added to an active account group.',
            )
        }
        if (group.category !== input.accountType) {
            throw new BadRequestException(
                `The account type must match the group category (${group.category}).`,
            )
        }
        if (
            input.normalBalance &&
            !(FICO_NORMAL_BALANCES as readonly string[]).includes(input.normalBalance)
        ) {
            throw new BadRequestException('Normal balance must be DEBIT or CREDIT.')
        }
        const accountCode = normalizeAccountCode(input.accountCode)
        assertAccountCodeFormat(accountCode, chart.accountCodeLength)
        if (!isCodeInRange(accountCode, group)) {
            throw new BadRequestException(
                `Account ${accountCode} is outside group ${group.code} range (${formatAccountCodeRange(group)}).`,
            )
        }
        const accountName = input.accountName?.trim()
        if (!accountName) {
            throw new BadRequestException('Account name is required.')
        }
        const reconciliationType = this.reconciliationType(
            input.isReconciliationAccount,
            input.reconciliationType,
        )
        if (input.openItemManagement && !input.isReconciliationAccount) {
            throw new BadRequestException(
                'Open-item management requires a reconciliation account.',
            )
        }
        const isPostingAccount = input.isPostingAccount ?? true
        return {
            chartOfAccountsId: chart.id,
            accountGroupId: group.id,
            accountCode,
            accountName,
            description: input.description?.trim() ?? '',
            accountType: input.accountType,
            normalBalance:
                input.normalBalance || defaultNormalBalance(input.accountType),
            isPostingAccount,
            allowManualPosting: isPostingAccount
                ? input.allowManualPosting ?? true
                : false,
            allowAutomaticPosting: isPostingAccount
                ? input.allowAutomaticPosting ?? true
                : false,
            isReconciliationAccount: input.isReconciliationAccount ?? false,
            reconciliationType,
            openItemManagement: input.openItemManagement ?? false,
            currencyRestriction: normalizeCurrency(input.currencyRestriction),
            status: 'ACTIVE',
            createdBy: user.id,
            updatedBy: user.id,
        }
    }

    private reconciliationType(
        isReconciliation: boolean | undefined,
        value: string | null | undefined,
    ) {
        if (!isReconciliation) return null
        if (!value || !(FICO_RECONCILIATION_TYPES as readonly string[]).includes(value)) {
            throw new BadRequestException(
                `A reconciliation account requires a type (${FICO_RECONCILIATION_TYPES.join(', ')}).`,
            )
        }
        return value
    }
}

export function accountTypeLabel(value: string) {
    return (FICO_ACCOUNT_TYPES as readonly string[]).includes(value)
        ? value
        : value
}
