import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FICO_RESOLVED_TRANSACTION_KEYS } from './fico-account-determination.service'
import { FicoAuditService } from './fico-audit.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { FICO_AUDIT_ACTIONS } from './fico.constants'

export type CreateAccountMappingInput = {
    companyId: string
    transactionKeyCode: string
    valuationClassId?: string | null
    debitAccountId: string
    creditAccountId: string
    effectiveFrom?: string | null
    effectiveTo?: string | null
}

export type UpdateAccountMappingInput = {
    debitAccountId?: string
    creditAccountId?: string
    effectiveFrom?: string | null
    effectiveTo?: string | null
    status?: string
}

const ACCOUNT_SELECT = {
    id: true,
    accountCode: true,
    accountName: true,
    accountType: true,
    status: true,
} as const

function toDate(value: string | null | undefined) {
    if (value === undefined || value === null || value === '') return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('Invalid effective date.')
    }
    return date
}

/**
 * Maintenance of MM account-determination mappings (transaction key → debit and
 * credit G/L account). Resolution at posting time stays in
 * `FicoAccountDeterminationService`; this service only edits the configuration.
 */
@Injectable()
export class FicoAccountMappingService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly audit: FicoAuditService,
    ) {}

    async overview(companyId: string, user: AuthRequestUser) {
        await this.access.assertAccess(user, companyId)
        const [settings, keys, valuationClasses] = await Promise.all([
            this.prisma.ficoCompanyAccountingSettings.findUnique({
                where: { companyId },
                select: {
                    status: true,
                    chartOfAccounts: { select: { id: true, code: true, name: true } },
                    accountDeterminationProfile: {
                        select: { id: true, code: true, name: true, status: true },
                    },
                },
            }),
            this.prisma.ficoTransactionKey.findMany({
                orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
            }),
            this.prisma.mmValuationClass.findMany({
                select: { id: true, code: true, name: true },
                orderBy: { code: 'asc' },
            }),
        ])
        const profileId = settings?.accountDeterminationProfile?.id
        const mappings = profileId
            ? await this.prisma.ficoMmAccountMapping.findMany({
                  where: { companyId, profileId },
                  orderBy: [{ transactionKeyCode: 'asc' }, { valuationScopeKey: 'asc' }],
                  include: {
                      debitAccount: { select: ACCOUNT_SELECT },
                      creditAccount: { select: ACCOUNT_SELECT },
                  },
              })
            : []
        const classById = new Map(valuationClasses.map((row) => [row.id, row]))
        const resolved = new Set<string>(FICO_RESOLVED_TRANSACTION_KEYS)

        return {
            companyId,
            settings: settings
                ? {
                      status: settings.status,
                      chartOfAccounts: settings.chartOfAccounts,
                      profile: settings.accountDeterminationProfile,
                  }
                : null,
            valuationClasses,
            transactionKeys: keys.map((key) => {
                const active = mappings.filter(
                    (mapping) =>
                        mapping.transactionKeyCode === key.code &&
                        mapping.status === 'ACTIVE',
                )
                return {
                    code: key.code,
                    name: key.name,
                    description: key.description,
                    requiresValuationClass: key.requiresValuationClass,
                    inventorySide: key.inventorySide,
                    status: key.status,
                    postsAutomatically: resolved.has(key.code),
                    activeMappings: active.length,
                    hasDefaultMapping: active.some(
                        (mapping) => mapping.valuationScopeKey === '*',
                    ),
                }
            }),
            mappings: mappings.map((mapping) => ({
                ...mapping,
                valuationClass: mapping.valuationClassId
                    ? classById.get(mapping.valuationClassId) ?? null
                    : null,
            })),
        }
    }

    async create(input: CreateAccountMappingInput, user: AuthRequestUser) {
        await this.access.assertAccess(user, input.companyId)
        const context = await this.companyContext(input.companyId)
        const key = await this.prisma.ficoTransactionKey.findUnique({
            where: { code: input.transactionKeyCode },
        })
        if (!key) throw new NotFoundException('Transaction key not found')
        if (key.status !== 'ACTIVE') {
            throw new BadRequestException('The transaction key is inactive.')
        }

        let valuationScopeKey = '*'
        let valuationClassId: string | null = null
        if (input.valuationClassId) {
            if (!key.requiresValuationClass) {
                throw new BadRequestException(
                    `${key.code} does not vary by valuation class; map it for all classes.`,
                )
            }
            const valuationClass = await this.prisma.mmValuationClass.findUnique({
                where: { id: input.valuationClassId },
                select: { id: true, code: true },
            })
            if (!valuationClass) throw new NotFoundException('Valuation class not found')
            valuationClassId = valuationClass.id
            valuationScopeKey = valuationClass.code
        }

        await this.assertAccounts(input.companyId, context.chartId, input.debitAccountId, input.creditAccountId)
        const effectiveFrom = toDate(input.effectiveFrom)
        const effectiveTo = toDate(input.effectiveTo)
        this.assertDates(effectiveFrom, effectiveTo)

        try {
            const created = await this.prisma.ficoMmAccountMapping.create({
                data: {
                    companyId: input.companyId,
                    profileId: context.profileId,
                    transactionKeyCode: key.code,
                    valuationClassId,
                    valuationScopeKey,
                    debitAccountId: input.debitAccountId,
                    creditAccountId: input.creditAccountId,
                    effectiveFrom,
                    effectiveTo,
                    status: 'ACTIVE',
                    createdBy: user.id,
                    updatedBy: user.id,
                },
            })
            await this.audit.log({
                companyId: input.companyId,
                actorId: user.id,
                action: FICO_AUDIT_ACTIONS.ACCOUNT_MAPPING_CREATE,
                entityType: 'FicoMmAccountMapping',
                entityId: created.id,
                newValues: created as unknown as Record<string, unknown>,
            })
            return created
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException(
                    valuationScopeKey === '*'
                        ? `${key.code} already has a mapping for all valuation classes. Edit it instead.`
                        : `${key.code} already has a mapping for valuation class ${valuationScopeKey}. Edit it instead.`,
                )
            }
            throw error
        }
    }

    async update(id: string, input: UpdateAccountMappingInput, user: AuthRequestUser) {
        const current = await this.prisma.ficoMmAccountMapping.findUnique({ where: { id } })
        if (!current) throw new NotFoundException('Account mapping not found')
        await this.access.assertAccess(user, current.companyId)
        const context = await this.companyContext(current.companyId)

        const debitAccountId = input.debitAccountId ?? current.debitAccountId
        const creditAccountId = input.creditAccountId ?? current.creditAccountId
        if (input.debitAccountId !== undefined || input.creditAccountId !== undefined) {
            await this.assertAccounts(current.companyId, context.chartId, debitAccountId, creditAccountId)
        }
        const effectiveFrom =
            input.effectiveFrom !== undefined ? toDate(input.effectiveFrom) : current.effectiveFrom
        const effectiveTo =
            input.effectiveTo !== undefined ? toDate(input.effectiveTo) : current.effectiveTo
        this.assertDates(effectiveFrom, effectiveTo)
        if (input.status !== undefined && !['ACTIVE', 'INACTIVE'].includes(input.status)) {
            throw new BadRequestException('Status must be ACTIVE or INACTIVE.')
        }

        const updated = await this.prisma.ficoMmAccountMapping.update({
            where: { id },
            data: {
                debitAccountId,
                creditAccountId,
                effectiveFrom,
                effectiveTo,
                ...(input.status !== undefined ? { status: input.status } : {}),
                updatedBy: user.id,
            },
        })
        await this.audit.log({
            companyId: current.companyId,
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.ACCOUNT_MAPPING_UPDATE,
            entityType: 'FicoMmAccountMapping',
            entityId: id,
            previousValues: current as unknown as Record<string, unknown>,
            newValues: updated as unknown as Record<string, unknown>,
        })
        return updated
    }

    async remove(id: string, user: AuthRequestUser) {
        const current = await this.prisma.ficoMmAccountMapping.findUnique({ where: { id } })
        if (!current) throw new NotFoundException('Account mapping not found')
        await this.access.assertAccess(user, current.companyId)
        await this.prisma.ficoMmAccountMapping.delete({ where: { id } })
        await this.audit.log({
            companyId: current.companyId,
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.ACCOUNT_MAPPING_DELETE,
            entityType: 'FicoMmAccountMapping',
            entityId: id,
            previousValues: current as unknown as Record<string, unknown>,
        })
        return { id, deleted: true }
    }

    private async companyContext(companyId: string) {
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId },
            select: { chartOfAccountsId: true, accountDeterminationProfileId: true },
        })
        if (!settings?.chartOfAccountsId) {
            throw new BadRequestException(
                'Assign a chart of accounts in company accounting settings before mapping accounts.',
            )
        }
        if (!settings.accountDeterminationProfileId) {
            throw new BadRequestException(
                'The company has no account determination profile yet.',
            )
        }
        return {
            chartId: settings.chartOfAccountsId,
            profileId: settings.accountDeterminationProfileId,
        }
    }

    /** Same eligibility the posting engine enforces, checked up front. */
    private async assertAccounts(
        companyId: string,
        chartId: string,
        debitAccountId: string,
        creditAccountId: string,
    ) {
        if (debitAccountId === creditAccountId) {
            throw new BadRequestException('The debit and credit accounts must be different.')
        }
        const accounts = await this.prisma.ficoGlAccount.findMany({
            where: { id: { in: [debitAccountId, creditAccountId] } },
            select: {
                id: true,
                accountCode: true,
                chartOfAccountsId: true,
                status: true,
                isPostingAccount: true,
                allowAutomaticPosting: true,
                companyAssignments: {
                    where: { companyId },
                    select: { postingEnabled: true },
                },
            },
        })
        for (const [side, accountId] of [
            ['debit', debitAccountId],
            ['credit', creditAccountId],
        ] as const) {
            const account = accounts.find((row) => row.id === accountId)
            if (!account) throw new NotFoundException(`The ${side} account was not found.`)
            const label = `The ${side} account ${account.accountCode}`
            if (account.chartOfAccountsId !== chartId) {
                throw new BadRequestException(`${label} is not in the company's chart of accounts.`)
            }
            if (account.status !== 'ACTIVE') {
                throw new BadRequestException(`${label} is inactive.`)
            }
            if (!account.isPostingAccount || !account.allowAutomaticPosting) {
                throw new BadRequestException(`${label} does not accept automatic postings.`)
            }
            if (!account.companyAssignments[0]?.postingEnabled) {
                throw new BadRequestException(
                    `${label} is not assigned to the company with posting enabled.`,
                )
            }
        }
    }

    private assertDates(from: Date | null, to: Date | null) {
        if (from && to && to < from) {
            throw new BadRequestException('The end date cannot be before the start date.')
        }
    }
}
