import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAuditService } from './fico-audit.service'
import {
    type AccountCodeRange,
    doRangesOverlap,
    formatAccountCodeRange,
    hasRange,
    isCodeInRange,
    isRangeWithin,
    normalizeAccountCodeLength,
    normalizeAccountCodeRange,
} from './fico-coa-rules'
import {
    FICO_ACCOUNT_TYPE_SCOPES,
    FICO_AUDIT_ACTIONS,
    isFicoAccountType,
} from './fico.constants'

export type ChartListQuery = {
    search?: string
    status?: string
}

export type CreateChartInput = {
    code: string
    name: string
    description?: string
    countryCode?: string
    accountCodeLength?: number | null
}

export type UpdateChartInput = {
    name?: string
    description?: string
    countryCode?: string
    accountCodeLength?: number | null
    status?: string
}

export type CreateGroupInput = {
    code: string
    name: string
    category: string
    parentGroupId?: string | null
    rangeFrom?: string | null
    rangeTo?: string | null
    sortOrder?: number
}

export type UpdateGroupInput = {
    name?: string
    category?: string
    parentGroupId?: string | null
    rangeFrom?: string | null
    rangeTo?: string | null
    sortOrder?: number
    status?: string
}

type GroupRangeParent = AccountCodeRange & { id: string; code: string; category: string }

function code(value: string) {
    return value.trim().toUpperCase()
}

function text(value: string | undefined, fallback = '') {
    return value === undefined ? fallback : value.trim()
}

@Injectable()
export class FicoChartOfAccountsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly audit: FicoAuditService,
    ) {}

    async list(query: ChartListQuery = {}) {
        const search = query.search?.trim()
        const charts = await this.prisma.ficoChartOfAccounts.findMany({
            where: {
                ...(query.status ? { status: query.status } : {}),
                ...(search
                    ? {
                          OR: [
                              { code: { contains: search, mode: 'insensitive' } },
                              { name: { contains: search, mode: 'insensitive' } },
                          ],
                      }
                    : {}),
            },
            include: {
                _count: { select: { groups: true, accounts: true, settings: true } },
            },
            orderBy: [{ code: 'asc' }],
        })
        return charts
    }

    async get(id: string) {
        const chart = await this.prisma.ficoChartOfAccounts.findUnique({
            where: { id },
            include: {
                groups: {
                    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
                },
                _count: { select: { accounts: true, settings: true } },
            },
        })
        if (!chart) throw new NotFoundException('Chart of accounts not found')
        return chart
    }

    async create(input: CreateChartInput, user: AuthRequestUser) {
        const chartCode = code(input.code)
        if (!/^[A-Z0-9_.-]{1,32}$/.test(chartCode)) {
            throw new BadRequestException(
                'Chart code may contain letters, numbers, dots, underscores and dashes only.',
            )
        }
        const existing = await this.prisma.ficoChartOfAccounts.findUnique({
            where: { code: chartCode },
            select: { id: true },
        })
        if (existing) {
            throw new ConflictException('A chart of accounts with this code already exists.')
        }
        const accountCodeLength = normalizeAccountCodeLength(input.accountCodeLength)
        const created = await this.prisma.ficoChartOfAccounts.create({
            data: {
                code: chartCode,
                name: input.name.trim(),
                description: text(input.description),
                countryCode: (input.countryCode || 'PH').trim().toUpperCase(),
                accountCodeLength,
                status: 'ACTIVE',
                createdBy: user.id,
                updatedBy: user.id,
            },
        })
        await this.audit.log({
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.CHART_CREATE,
            entityType: 'FicoChartOfAccounts',
            entityId: created.id,
            newValues: created as unknown as Record<string, unknown>,
        })
        return created
    }

    async update(id: string, input: UpdateChartInput, user: AuthRequestUser) {
        const current = await this.get(id)
        let accountCodeLength = current.accountCodeLength
        if (input.accountCodeLength !== undefined) {
            accountCodeLength = normalizeAccountCodeLength(input.accountCodeLength)
            if (
                accountCodeLength !== null &&
                accountCodeLength !== current.accountCodeLength
            ) {
                await this.assertCodesFitLength(id, accountCodeLength)
            }
        }
        const data = {
            ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(input.description !== undefined
                ? { description: text(input.description) }
                : {}),
            ...(input.countryCode !== undefined
                ? { countryCode: input.countryCode.trim().toUpperCase() }
                : {}),
            ...(input.accountCodeLength !== undefined ? { accountCodeLength } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            updatedBy: user.id,
        }
        if (input.status === 'INACTIVE' && current.status === 'ACTIVE') {
            await this.assertCanDeactivate(id)
        }
        const updated = await this.prisma.ficoChartOfAccounts.update({
            where: { id },
            data,
        })
        await this.audit.log({
            actorId: user.id,
            action:
                input.status !== undefined && input.status !== current.status
                    ? FICO_AUDIT_ACTIONS.CHART_STATUS_CHANGE
                    : FICO_AUDIT_ACTIONS.CHART_UPDATE,
            entityType: 'FicoChartOfAccounts',
            entityId: id,
            previousValues: current as unknown as Record<string, unknown>,
            newValues: updated as unknown as Record<string, unknown>,
        })
        return updated
    }

    async remove(id: string, user: AuthRequestUser) {
        const chart = await this.get(id)
        if (chart.groups.length > 0 || chart._count.accounts > 0) {
            throw new ConflictException(
                'A chart of accounts with groups or accounts cannot be deleted. Deactivate it instead.',
            )
        }
        if (chart._count.settings > 0) {
            throw new ConflictException(
                'A chart of accounts assigned to a company cannot be deleted.',
            )
        }
        await this.prisma.ficoChartOfAccounts.delete({ where: { id } })
        await this.audit.log({
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.CHART_STATUS_CHANGE,
            entityType: 'FicoChartOfAccounts',
            entityId: id,
            previousValues: chart as unknown as Record<string, unknown>,
            metadata: { operation: 'DELETE' },
        })
        return { id, deleted: true }
    }

    async duplicate(
        id: string,
        input: { code: string; name: string; description?: string },
        user: AuthRequestUser,
    ) {
        const source = await this.prisma.ficoChartOfAccounts.findUnique({
            where: { id },
            include: {
                groups: true,
                accounts: true,
            },
        })
        if (!source) throw new NotFoundException('Chart of accounts not found')
        const nextCode = code(input.code)
        const existing = await this.prisma.ficoChartOfAccounts.findUnique({
            where: { code: nextCode },
            select: { id: true },
        })
        if (existing) {
            throw new ConflictException('A chart of accounts with this code already exists.')
        }

        const created = await this.prisma.$transaction(async (tx) => {
            const chart = await tx.ficoChartOfAccounts.create({
                data: {
                    code: nextCode,
                    name: input.name.trim(),
                    description: text(
                        input.description,
                        source.description
                            ? `${source.description} (copy)`
                            : 'Copy',
                    ),
                    countryCode: source.countryCode,
                    accountCodeLength: source.accountCodeLength,
                    status: 'ACTIVE',
                    createdBy: user.id,
                    updatedBy: user.id,
                },
            })

            const groupIdBySource = new Map<string, string>()
            const remaining = [...source.groups]
            while (remaining.length > 0) {
                const index = remaining.findIndex(
                    (group) =>
                        !group.parentGroupId ||
                        groupIdBySource.has(group.parentGroupId),
                )
                if (index < 0) {
                    throw new BadRequestException(
                        'The source chart contains an invalid account-group hierarchy.',
                    )
                }
                const [group] = remaining.splice(index, 1)
                const saved = await tx.ficoGlAccountGroup.create({
                    data: {
                        chartOfAccountsId: chart.id,
                        parentGroupId: group.parentGroupId
                            ? groupIdBySource.get(group.parentGroupId) ?? null
                            : null,
                        code: group.code,
                        name: group.name,
                        category: group.category,
                        rangeFrom: group.rangeFrom,
                        rangeTo: group.rangeTo,
                        sortOrder: group.sortOrder,
                        status: group.status,
                        createdBy: user.id,
                        updatedBy: user.id,
                    },
                })
                groupIdBySource.set(group.id, saved.id)
            }

            for (const account of source.accounts) {
                const groupId = groupIdBySource.get(account.accountGroupId)
                if (!groupId) {
                    throw new BadRequestException(
                        `Account ${account.accountCode} is not linked to a group in the source chart.`,
                    )
                }
                await tx.ficoGlAccount.create({
                    data: {
                        chartOfAccountsId: chart.id,
                        accountGroupId: groupId,
                        accountCode: account.accountCode,
                        accountName: account.accountName,
                        description: account.description,
                        accountType: account.accountType,
                        normalBalance: account.normalBalance,
                        isPostingAccount: account.isPostingAccount,
                        allowManualPosting: account.allowManualPosting,
                        allowAutomaticPosting: account.allowAutomaticPosting,
                        isReconciliationAccount: account.isReconciliationAccount,
                        reconciliationType: account.reconciliationType,
                        openItemManagement: account.openItemManagement,
                        currencyRestriction: account.currencyRestriction,
                        status: account.status,
                        createdBy: user.id,
                        updatedBy: user.id,
                    },
                })
            }
            return chart
        })

        await this.audit.log({
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.CHART_DUPLICATE,
            entityType: 'FicoChartOfAccounts',
            entityId: created.id,
            previousValues: { sourceChartId: id },
            newValues: created as unknown as Record<string, unknown>,
        })
        return created
    }

    async listGroups(chartOfAccountsId: string) {
        await this.assertChartExists(chartOfAccountsId)
        const groups = await this.prisma.ficoGlAccountGroup.findMany({
            where: { chartOfAccountsId },
            include: { _count: { select: { accounts: true, children: true } } },
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        })
        return groups
    }

    async createGroup(
        chartOfAccountsId: string,
        input: CreateGroupInput,
        user: AuthRequestUser,
    ) {
        const chart = await this.assertChartExists(chartOfAccountsId)
        if (!isFicoAccountType(input.category)) {
            throw new BadRequestException('Invalid account-group category.')
        }
        const range = normalizeAccountCodeRange(
            input.rangeFrom,
            input.rangeTo,
            chart.accountCodeLength,
        )
        const groupCode = code(input.code)
        const duplicate = await this.prisma.ficoGlAccountGroup.findUnique({
            where: {
                chartOfAccountsId_code: { chartOfAccountsId, code: groupCode },
            },
            select: { id: true },
        })
        if (duplicate) {
            throw new ConflictException(
                'An account group with this code already exists in the chart.',
            )
        }
        const parent = input.parentGroupId
            ? await this.getGroup(chartOfAccountsId, input.parentGroupId)
            : null
        if (parent && parent.category !== input.category) {
            throw new BadRequestException(
                'A subgroup must have the same category as its parent group.',
            )
        }
        await this.assertGroupRange(chartOfAccountsId, null, parent, range)
        const created = await this.prisma.ficoGlAccountGroup.create({
            data: {
                chartOfAccountsId,
                parentGroupId: parent?.id ?? null,
                code: groupCode,
                name: input.name.trim(),
                category: input.category,
                rangeFrom: range.rangeFrom,
                rangeTo: range.rangeTo,
                sortOrder: input.sortOrder ?? 0,
                status: 'ACTIVE',
                createdBy: user.id,
                updatedBy: user.id,
            },
        })
        await this.audit.log({
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.GROUP_CREATE,
            entityType: 'FicoGlAccountGroup',
            entityId: created.id,
            newValues: created as unknown as Record<string, unknown>,
        })
        return created
    }

    async updateGroup(
        chartOfAccountsId: string,
        groupId: string,
        input: UpdateGroupInput,
        user: AuthRequestUser,
    ) {
        const current = await this.getGroup(chartOfAccountsId, groupId)
        const nextCategory = input.category ?? current.category
        if (input.category && input.category !== current.category) {
            const child = await this.prisma.ficoGlAccountGroup.findFirst({
                where: { parentGroupId: groupId, category: { not: input.category } },
                select: { id: true },
            })
            if (child) {
                throw new BadRequestException(
                    'The group category cannot change while a child group has a different category.',
                )
            }
            const account = await this.prisma.ficoGlAccount.findFirst({
                where: {
                    accountGroupId: groupId,
                    accountType: { not: input.category },
                },
                select: { id: true },
            })
            if (account) {
                throw new BadRequestException(
                    'The group category cannot change while it contains accounts of another type.',
                )
            }
        }

        let parentId = current.parentGroupId
        if (input.parentGroupId !== undefined) {
            parentId = input.parentGroupId || null
        }
        let parent: GroupRangeParent | null = null
        if (parentId) {
            if (parentId === groupId) {
                throw new BadRequestException('A group cannot be its own parent.')
            }
            parent = await this.getGroup(chartOfAccountsId, parentId)
            if (parent.category !== nextCategory) {
                throw new BadRequestException(
                    'A subgroup must have the same category as its parent group.',
                )
            }
            await this.assertNoCycle(chartOfAccountsId, groupId, parentId)
        }

        const rangeChanged =
            input.rangeFrom !== undefined || input.rangeTo !== undefined
        const range: AccountCodeRange = rangeChanged
            ? normalizeAccountCodeRange(
                  input.rangeFrom !== undefined ? input.rangeFrom : current.rangeFrom,
                  input.rangeTo !== undefined ? input.rangeTo : current.rangeTo,
                  (await this.assertChartExists(chartOfAccountsId)).accountCodeLength,
              )
            : { rangeFrom: current.rangeFrom, rangeTo: current.rangeTo }
        if (rangeChanged || parentId !== current.parentGroupId) {
            await this.assertGroupRange(chartOfAccountsId, groupId, parent, range)
        }

        const updated = await this.prisma.ficoGlAccountGroup.update({
            where: { id: groupId },
            data: {
                ...(input.name !== undefined ? { name: input.name.trim() } : {}),
                ...(input.category !== undefined
                    ? { category: input.category }
                    : {}),
                ...(input.parentGroupId !== undefined
                    ? { parentGroupId: parentId }
                    : {}),
                ...(rangeChanged
                    ? { rangeFrom: range.rangeFrom, rangeTo: range.rangeTo }
                    : {}),
                ...(input.sortOrder !== undefined
                    ? { sortOrder: input.sortOrder }
                    : {}),
                ...(input.status !== undefined ? { status: input.status } : {}),
                updatedBy: user.id,
            },
        })
        await this.audit.log({
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.GROUP_UPDATE,
            entityType: 'FicoGlAccountGroup',
            entityId: groupId,
            previousValues: current as unknown as Record<string, unknown>,
            newValues: updated as unknown as Record<string, unknown>,
        })
        return updated
    }

    async removeGroup(
        chartOfAccountsId: string,
        groupId: string,
        user: AuthRequestUser,
    ) {
        const current = await this.getGroup(chartOfAccountsId, groupId)
        const [children, accounts] = await Promise.all([
            this.prisma.ficoGlAccountGroup.count({
                where: { parentGroupId: groupId },
            }),
            this.prisma.ficoGlAccount.count({
                where: { accountGroupId: groupId },
            }),
        ])
        if (children > 0 || accounts > 0) {
            throw new ConflictException(
                'A group with child groups or accounts cannot be deleted.',
            )
        }
        await this.prisma.ficoGlAccountGroup.delete({ where: { id: groupId } })
        await this.audit.log({
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.GROUP_DELETE,
            entityType: 'FicoGlAccountGroup',
            entityId: groupId,
            previousValues: current as unknown as Record<string, unknown>,
        })
        return { id: groupId, deleted: true }
    }

    private async getGroup(chartOfAccountsId: string, groupId: string) {
        const group = await this.prisma.ficoGlAccountGroup.findFirst({
            where: { id: groupId, chartOfAccountsId },
        })
        if (!group) throw new NotFoundException('Account group not found')
        return group
    }

    private async assertNoCycle(
        chartOfAccountsId: string,
        groupId: string,
        parentId: string,
    ) {
        let cursor: string | null = parentId
        const seen = new Set<string>()
        while (cursor) {
            if (cursor === groupId) {
                throw new BadRequestException(
                    'The selected parent would create a circular account-group hierarchy.',
                )
            }
            if (seen.has(cursor)) {
                throw new BadRequestException(
                    'The account-group hierarchy already contains a cycle.',
                )
            }
            seen.add(cursor)
            const row: { parentGroupId: string | null } | null =
                await this.prisma.ficoGlAccountGroup.findFirst({
                    where: { id: cursor, chartOfAccountsId },
                    select: { parentGroupId: true },
                })
            cursor = row?.parentGroupId ?? null
        }
    }

    private async assertChartExists(id: string) {
        const chart = await this.prisma.ficoChartOfAccounts.findUnique({
            where: { id },
            select: { id: true, accountCodeLength: true },
        })
        if (!chart) throw new NotFoundException('Chart of accounts not found')
        return chart
    }

    /**
     * A group range must sit inside its parent's range, must not overlap a
     * sibling's range, and must still contain its existing subgroups and accounts.
     */
    private async assertGroupRange(
        chartOfAccountsId: string,
        groupId: string | null,
        parent: GroupRangeParent | null,
        range: AccountCodeRange,
    ) {
        if (parent && hasRange(parent) && !isRangeWithin(range, parent)) {
            throw new BadRequestException(
                `The range must sit inside the parent group ${parent.code} range (${formatAccountCodeRange(parent)}).`,
            )
        }
        if (hasRange(range)) {
            const siblings = await this.prisma.ficoGlAccountGroup.findMany({
                where: {
                    chartOfAccountsId,
                    parentGroupId: parent?.id ?? null,
                    rangeFrom: { not: null },
                    ...(groupId ? { id: { not: groupId } } : {}),
                },
                select: { code: true, rangeFrom: true, rangeTo: true },
            })
            const clash = siblings.find((sibling) => doRangesOverlap(range, sibling))
            if (clash) {
                throw new BadRequestException(
                    `The range overlaps account group ${clash.code} (${formatAccountCodeRange(clash)}).`,
                )
            }
        }
        if (!groupId) return
        const [children, accounts] = await Promise.all([
            this.prisma.ficoGlAccountGroup.findMany({
                where: { parentGroupId: groupId },
                select: { code: true, rangeFrom: true, rangeTo: true },
            }),
            this.prisma.ficoGlAccount.findMany({
                where: { accountGroupId: groupId },
                select: { accountCode: true },
            }),
        ])
        const child = children.find(
            (row) => hasRange(row) && !isRangeWithin(row, range),
        )
        if (child) {
            throw new BadRequestException(
                `Subgroup ${child.code} (${formatAccountCodeRange(child)}) would fall outside the new range.`,
            )
        }
        const outside = accounts.find((row) => !isCodeInRange(row.accountCode, range))
        if (outside) {
            throw new BadRequestException(
                `Account ${outside.accountCode} would fall outside the new range (${formatAccountCodeRange(range)}).`,
            )
        }
    }

    private async assertCodesFitLength(chartOfAccountsId: string, length: number) {
        const [accounts, groups] = await Promise.all([
            this.prisma.ficoGlAccount.findMany({
                where: { chartOfAccountsId },
                select: { accountCode: true },
            }),
            this.prisma.ficoGlAccountGroup.findMany({
                where: { chartOfAccountsId, rangeFrom: { not: null } },
                select: { code: true, rangeFrom: true },
            }),
        ])
        const account = accounts.find((row) => row.accountCode.length !== length)
        if (account) {
            throw new BadRequestException(
                `Account ${account.accountCode} does not have ${length} characters; the chart's code length cannot change to ${length}.`,
            )
        }
        const group = groups.find((row) => row.rangeFrom?.length !== length)
        if (group) {
            throw new BadRequestException(
                `Account group ${group.code} has a range of a different length; the chart's code length cannot change to ${length}.`,
            )
        }
    }

    private async assertCanDeactivate(id: string) {
        const activeSettings = await this.prisma.ficoCompanyAccountingSettings.count({
            where: { chartOfAccountsId: id, status: 'ACTIVE' },
        })
        if (activeSettings > 0) {
            throw new BadRequestException(
                'The chart is used by an active company accounting configuration and cannot be deactivated.',
            )
        }
    }
}

export function isFicoAccountScope(value: string) {
    return (FICO_ACCOUNT_TYPE_SCOPES as readonly string[]).includes(value)
}
