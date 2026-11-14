import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import {
    FICO_DETERMINATION_AUDIT_ACTIONS,
    FICO_DETERMINATION_DIMENSIONS,
    FICO_DETERMINATION_ENTITY_TYPE,
    FICO_DETERMINATION_MODULE_LABELS,
    FICO_DETERMINATION_SOURCE_MODULES,
    FICO_MATERIAL_DIMENSION_MODULES,
    FICO_SALES_DIMENSION_MODULES,
    ficoDeterminationTypesForModule,
    type FicoDeterminationDimension,
} from './fico-account-determination.constants'
import { FicoAuditService } from './fico-audit.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { FicoPostingValidationService } from './fico-posting-validation.service'

export type DeterminationLineInput = {
    side: string
    glAccountId: string
    description?: string | null
}

export type CreateDeterminationInput = {
    determinationCode: string
    name: string
    description?: string
    companyId: string
    sourceModule: string
    transactionType: string
    transactionKeyCode?: string | null
    priority?: number
    effectiveFrom?: string | null
    effectiveTo?: string | null
    valuationClassId?: string | null
    materialTypeCode?: string | null
    movementType?: string | null
    customerAccountGroup?: string | null
    salesOrganization?: string | null
    distributionChannel?: string | null
    changeReason?: string | null
    lines: DeterminationLineInput[]
}

export type UpdateDeterminationInput = Partial<
    Omit<CreateDeterminationInput, 'companyId' | 'sourceModule' | 'transactionType'>
>

export type DeterminationQuery = {
    companyId?: string
    sourceModule?: string
    transactionType?: string
    status?: string
    search?: string
    page?: number
    pageSize?: number
}

const RULE_INCLUDE = {
    lines: {
        orderBy: { lineNumber: 'asc' },
        include: {
            glAccount: {
                select: {
                    id: true,
                    accountCode: true,
                    accountName: true,
                    accountType: true,
                    status: true,
                },
            },
        },
    },
    valuationClass: { select: { id: true, code: true, name: true } },
    materialType: { select: { code: true, name: true } },
} as const

function toDate(value: string | null | undefined, field: string) {
    if (value === undefined || value === null || value === '') return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        throw new BadRequestException(`Invalid ${field}.`)
    }
    return new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    )
}

function normalise(value: string | null | undefined) {
    const text = value?.trim()
    return text ? text.toUpperCase() : null
}

/**
 * Maintenance and approval lifecycle for centralized account determination
 * rules. Resolution itself lives in `FicoAccountResolutionService`; this
 * service only ever changes configuration, and only while a rule is a draft.
 */
@Injectable()
export class FicoAccountDeterminationRulesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly audit: FicoAuditService,
        private readonly postingValidation: FicoPostingValidationService,
    ) {}

    async list(query: DeterminationQuery, user: AuthRequestUser) {
        const companyId = query.companyId
        if (!companyId) {
            throw new BadRequestException('A company is required to list account determinations.')
        }
        await this.access.assertAccess(user, companyId)
        const page = Math.max(1, query.page ?? 1)
        const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50))
        const search = query.search?.trim()
        const where: Prisma.FicoAccountDeterminationRuleWhereInput = {
            companyId,
            ...(query.sourceModule ? { sourceModule: query.sourceModule } : {}),
            ...(query.transactionType ? { transactionType: query.transactionType } : {}),
            ...(query.status ? { status: query.status } : {}),
            ...(search
                ? {
                      OR: [
                          { determinationCode: { contains: search, mode: 'insensitive' } },
                          { name: { contains: search, mode: 'insensitive' } },
                      ],
                  }
                : {}),
        }
        const [items, total] = await Promise.all([
            this.prisma.ficoAccountDeterminationRule.findMany({
                where,
                include: RULE_INCLUDE,
                orderBy: [{ priority: 'asc' }, { determinationCode: 'asc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.ficoAccountDeterminationRule.count({ where }),
        ])
        return { items, total, page, pageSize }
    }

    async overview(query: DeterminationQuery, user: AuthRequestUser) {
        const companyId = query.companyId
        if (!companyId) {
            throw new BadRequestException('A company is required to summarise account determinations.')
        }
        await this.access.assertAccess(user, companyId)
        const where: Prisma.FicoAccountDeterminationRuleWhereInput = { companyId }
        const [total, rules] = await Promise.all([
            this.prisma.ficoAccountDeterminationRule.count({ where }),
            this.prisma.ficoAccountDeterminationRule.findMany({
                where,
                select: { status: true, sourceModule: true, transactionType: true },
            }),
        ])
        const byStatus: Record<string, number> = {}
        const byModule: Record<string, number> = {}
        for (const rule of rules) {
            byStatus[rule.status] = (byStatus[rule.status] ?? 0) + 1
            byModule[rule.sourceModule] = (byModule[rule.sourceModule] ?? 0) + 1
        }
        return {
            companyId,
            total,
            byStatus,
            byModule,
            active: byStatus.ACTIVE ?? 0,
            pendingApproval: byStatus.PENDING_APPROVAL ?? 0,
            drafts: byStatus.DRAFT ?? 0,
            rejected: byStatus.REJECTED ?? 0,
        }
    }

    async reference(query: { companyId?: string }, user: AuthRequestUser) {
        if (query.companyId) await this.access.assertAccess(user, query.companyId)
        const [valuationClasses, materialTypes, divisions] = await Promise.all([
            this.prisma.mmValuationClass.findMany({
                select: { id: true, code: true, name: true },
                orderBy: { code: 'asc' },
            }),
            this.prisma.mmMaterialType.findMany({
                select: { code: true, name: true },
                where: { isActive: true },
                orderBy: { code: 'asc' },
            }),
            this.prisma.sdProduct.findMany({
                select: { divisionId: true },
                distinct: ['divisionId'],
                take: 100,
            }),
        ])
        return {
            modules: FICO_DETERMINATION_SOURCE_MODULES.map((code) => ({
                code,
                label: FICO_DETERMINATION_MODULE_LABELS[code],
                transactionTypes: ficoDeterminationTypesForModule(code),
            })),
            dimensions: FICO_DETERMINATION_DIMENSIONS,
            valuationClasses,
            materialTypes,
            /** SD customer categories used for account-group determination. */
            customerAccountGroups: ['RETAIL', 'CORPORATE', 'EMPLOYEE', 'WHOLESALE'],
            /** SD division codes used by SdProduct/SdSalesOrder.divisionId. */
            salesOrganizations: divisions
                .map((row) => row.divisionId)
                .filter((value): value is string => !!value)
                .sort(),
            /** SdSalesOrder.channel values. */
            distributionChannels: ['STANDARD', 'POS', 'ECOMMERCE'],
        }
    }

    async get(id: string, user: AuthRequestUser) {
        const rule = await this.findRule(id)
        await this.access.assertAccess(user, rule.companyId)
        return rule
    }

    /** Company scope check used by callers that only have a company id. */
    async assertCompanyAccess(companyId: string, user: AuthRequestUser) {
        await this.access.assertAccess(user, companyId)
    }

    async create(input: CreateDeterminationInput, user: AuthRequestUser) {
        await this.access.assertAccess(user, input.companyId)
        const sourceModule = normalise(input.sourceModule) ?? ''
        const transactionType = normalise(input.transactionType) ?? ''
        this.assertModuleAndType(sourceModule, transactionType)
        this.assertModuleDimensions(sourceModule, input)

        const effectiveFrom = toDate(input.effectiveFrom, 'effective from date')
        const effectiveTo = toDate(input.effectiveTo, 'effective to date')
        if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
            throw new BadRequestException('Effective to date cannot be before the effective from date.')
        }

        const lines = await this.normaliseLines(input.companyId, input.lines, effectiveFrom)

        const existing = await this.prisma.ficoAccountDeterminationRule.findUnique({
            where: { determinationCode: input.determinationCode.trim() },
            select: { id: true },
        })
        if (existing) {
            throw new ConflictException(
                `A determination with code ${input.determinationCode.trim()} already exists.`,
            )
        }

        const created = await this.prisma.ficoAccountDeterminationRule.create({
            data: {
                determinationCode: input.determinationCode.trim(),
                name: input.name.trim(),
                description: input.description ?? '',
                companyId: input.companyId,
                sourceModule,
                transactionType,
                transactionKeyCode: input.transactionKeyCode?.trim() || null,
                priority: input.priority ?? 100,
                effectiveFrom,
                effectiveTo,
                status: 'DRAFT',
                valuationClassId: input.valuationClassId || null,
                materialTypeCode: input.materialTypeCode?.trim() || null,
                movementType: normalise(input.movementType),
                customerAccountGroup: normalise(input.customerAccountGroup),
                salesOrganization: normalise(input.salesOrganization),
                distributionChannel: normalise(input.distributionChannel),
                changeReason: input.changeReason ?? null,
                createdBy: user.id,
                updatedBy: user.id,
                lines: { create: lines },
            },
            include: RULE_INCLUDE,
        })

        await this.audit.log({
            companyId: created.companyId,
            actorId: user.id,
            action: FICO_DETERMINATION_AUDIT_ACTIONS.CREATE,
            entityType: FICO_DETERMINATION_ENTITY_TYPE,
            entityId: created.id,
            newValues: this.snapshot(created),
            reason: input.changeReason ?? null,
        })

        return created
    }

    async update(id: string, input: UpdateDeterminationInput, user: AuthRequestUser) {
        const existing = await this.findRule(id)
        await this.access.assertAccess(user, existing.companyId)
        if (existing.status !== 'DRAFT') {
            throw new BadRequestException(
                `Only draft determinations can be edited. ${existing.determinationCode} is ${existing.status}.`,
            )
        }

        const effectiveFrom =
            input.effectiveFrom !== undefined
                ? toDate(input.effectiveFrom, 'effective from date')
                : existing.effectiveFrom
        const effectiveTo =
            input.effectiveTo !== undefined
                ? toDate(input.effectiveTo, 'effective to date')
                : existing.effectiveTo
        if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
            throw new BadRequestException('Effective to date cannot be before the effective from date.')
        }

        this.assertModuleDimensions(existing.sourceModule, {
            ...existing,
            ...input,
        })
        const lines = input.lines
            ? await this.normaliseLines(existing.companyId, input.lines, effectiveFrom)
            : null

        const updated = await this.prisma.$transaction(async (tx) => {
            if (lines) {
                await tx.ficoAccountDeterminationLine.deleteMany({ where: { ruleId: id } })
            }
            return tx.ficoAccountDeterminationRule.update({
                where: { id },
                data: {
                    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
                    ...(input.description !== undefined
                        ? { description: input.description }
                        : {}),
                    ...(input.transactionKeyCode !== undefined
                        ? { transactionKeyCode: input.transactionKeyCode?.trim() || null }
                        : {}),
                    ...(input.priority !== undefined ? { priority: input.priority } : {}),
                    ...(input.effectiveFrom !== undefined ? { effectiveFrom } : {}),
                    ...(input.effectiveTo !== undefined ? { effectiveTo } : {}),
                    ...(input.valuationClassId !== undefined
                        ? { valuationClassId: input.valuationClassId || null }
                        : {}),
                    ...(input.materialTypeCode !== undefined
                        ? { materialTypeCode: input.materialTypeCode?.trim() || null }
                        : {}),
                    ...(input.movementType !== undefined
                        ? { movementType: normalise(input.movementType) }
                        : {}),
                    ...(input.customerAccountGroup !== undefined
                        ? { customerAccountGroup: normalise(input.customerAccountGroup) }
                        : {}),
                    ...(input.salesOrganization !== undefined
                        ? { salesOrganization: normalise(input.salesOrganization) }
                        : {}),
                    ...(input.distributionChannel !== undefined
                        ? { distributionChannel: normalise(input.distributionChannel) }
                        : {}),
                    ...(input.changeReason !== undefined
                        ? { changeReason: input.changeReason }
                        : {}),
                    ...(lines ? { lines: { create: lines } } : {}),
                    updatedBy: user.id,
                },
                include: RULE_INCLUDE,
            })
        })

        await this.audit.log({
            companyId: updated.companyId,
            actorId: user.id,
            action: FICO_DETERMINATION_AUDIT_ACTIONS.UPDATE,
            entityType: FICO_DETERMINATION_ENTITY_TYPE,
            entityId: updated.id,
            previousValues: this.snapshot(existing),
            newValues: this.snapshot(updated),
            reason: input.changeReason ?? null,
        })

        return updated
    }

    async remove(id: string, user: AuthRequestUser) {
        const existing = await this.findRule(id)
        await this.access.assertAccess(user, existing.companyId)
        if (existing.status !== 'DRAFT') {
            throw new BadRequestException(
                `Only draft determinations can be deleted. ${existing.determinationCode} is ${existing.status}; deactivate it instead.`,
            )
        }
        await this.prisma.ficoAccountDeterminationRule.delete({ where: { id } })
        await this.audit.log({
            companyId: existing.companyId,
            actorId: user.id,
            action: FICO_DETERMINATION_AUDIT_ACTIONS.DELETE,
            entityType: FICO_DETERMINATION_ENTITY_TYPE,
            entityId: existing.id,
            previousValues: this.snapshot(existing),
        })
        return { id, deleted: true }
    }

    async submit(id: string, user: AuthRequestUser) {
        return this.transition(id, user, {
            from: ['DRAFT'],
            action: FICO_DETERMINATION_AUDIT_ACTIONS.SUBMIT,
            label: 'submit',
            data: () => ({
                status: 'PENDING_APPROVAL',
                submittedBy: user.id,
                submittedAt: new Date(),
                rejectedBy: null,
                rejectedAt: null,
                rejectionReason: null,
                updatedBy: user.id,
            }),
        })
    }

    async resubmit(id: string, user: AuthRequestUser) {
        return this.transition(id, user, {
            from: ['REJECTED'],
            action: FICO_DETERMINATION_AUDIT_ACTIONS.RESUBMIT,
            label: 'resubmit',
            data: () => ({
                status: 'PENDING_APPROVAL',
                submittedBy: user.id,
                submittedAt: new Date(),
                rejectedBy: null,
                rejectedAt: null,
                rejectionReason: null,
                updatedBy: user.id,
            }),
        })
    }

    async approve(id: string, input: { reason?: string }, user: AuthRequestUser) {
        return this.transition(id, user, {
            from: ['PENDING_APPROVAL'],
            action: FICO_DETERMINATION_AUDIT_ACTIONS.APPROVE,
            label: 'approve',
            reason: input.reason,
            data: () => ({
                status: 'APPROVED',
                approvedBy: user.id,
                approvedAt: new Date(),
                updatedBy: user.id,
            }),
        })
    }

    async reject(id: string, input: { reason?: string }, user: AuthRequestUser) {
        const reason = input.reason?.trim()
        if (!reason) {
            throw new BadRequestException('A rejection reason is required.')
        }
        return this.transition(id, user, {
            from: ['PENDING_APPROVAL'],
            action: FICO_DETERMINATION_AUDIT_ACTIONS.REJECT,
            label: 'reject',
            reason,
            data: () => ({
                status: 'REJECTED',
                rejectedBy: user.id,
                rejectedAt: new Date(),
                rejectionReason: reason,
                updatedBy: user.id,
            }),
        })
    }

    async activate(id: string, user: AuthRequestUser) {
        const existing = await this.findRule(id)
        await this.access.assertAccess(user, existing.companyId)
        if (!['APPROVED', 'INACTIVE'].includes(existing.status)) {
            throw new BadRequestException(
                `Only approved determinations can be activated. ${existing.determinationCode} is ${existing.status}.`,
            )
        }
        if (!existing.approvedBy || !existing.approvedAt) {
            throw new BadRequestException(
                'A determination must be approved before it can be activated.',
            )
        }
        this.assertPostableLines(existing)
        await this.assertNoActiveClone(existing)

        const updated = await this.prisma.ficoAccountDeterminationRule.update({
            where: { id },
            data: {
                status: 'ACTIVE',
                activatedBy: user.id,
                activatedAt: new Date(),
                updatedBy: user.id,
            },
            include: RULE_INCLUDE,
        })
        await this.audit.log({
            companyId: updated.companyId,
            actorId: user.id,
            action: FICO_DETERMINATION_AUDIT_ACTIONS.ACTIVATE,
            entityType: FICO_DETERMINATION_ENTITY_TYPE,
            entityId: updated.id,
            previousValues: this.snapshot(existing),
            newValues: this.snapshot(updated),
        })
        return updated
    }

    async deactivate(id: string, input: { reason?: string }, user: AuthRequestUser) {
        return this.transition(id, user, {
            from: ['ACTIVE'],
            action: FICO_DETERMINATION_AUDIT_ACTIONS.DEACTIVATE,
            label: 'deactivate',
            reason: input.reason,
            data: () => ({
                status: 'INACTIVE',
                deactivatedBy: user.id,
                deactivatedAt: new Date(),
                updatedBy: user.id,
            }),
        })
    }

    async history(id: string, user: AuthRequestUser) {
        const rule = await this.prisma.ficoAccountDeterminationRule.findUnique({
            where: { id },
            select: { id: true, companyId: true },
        })
        if (!rule) throw new NotFoundException('Account determination not found')
        await this.access.assertAccess(user, rule.companyId)
        return this.audit.listForEntity(
            rule.companyId,
            FICO_DETERMINATION_ENTITY_TYPE,
            rule.id,
        )
    }

    async configurationHistory(query: DeterminationQuery, user: AuthRequestUser) {
        const companyId = query.companyId
        if (!companyId) {
            throw new BadRequestException('A company is required to read determination history.')
        }
        await this.access.assertAccess(user, companyId)
        return this.audit.list({
            companyId,
            entityType: FICO_DETERMINATION_ENTITY_TYPE,
            page: query.page,
            pageSize: query.pageSize,
        })
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private async findRule(id: string) {
        const rule = await this.prisma.ficoAccountDeterminationRule.findUnique({
            where: { id },
            include: RULE_INCLUDE,
        })
        if (!rule) throw new NotFoundException('Account determination not found')
        return rule
    }

    private async transition(
        id: string,
        user: AuthRequestUser,
        options: {
            from: string[]
            action: string
            label: string
            reason?: string
            data: () => Prisma.FicoAccountDeterminationRuleUpdateInput
        },
    ) {
        const existing = await this.findRule(id)
        await this.access.assertAccess(user, existing.companyId)
        if (!options.from.includes(existing.status)) {
            throw new BadRequestException(
                `Cannot ${options.label} a determination in ${existing.status} status.`,
            )
        }
        if (options.action === FICO_DETERMINATION_AUDIT_ACTIONS.SUBMIT) {
            this.assertPostableLines(existing)
        }
        const updated = await this.prisma.ficoAccountDeterminationRule.update({
            where: { id },
            data: options.data(),
            include: RULE_INCLUDE,
        })
        await this.audit.log({
            companyId: updated.companyId,
            actorId: user.id,
            action: options.action,
            entityType: FICO_DETERMINATION_ENTITY_TYPE,
            entityId: updated.id,
            previousValues: this.snapshot(existing),
            newValues: this.snapshot(updated),
            reason: options.reason ?? null,
        })
        return updated
    }

    private assertPostableLines(rule: {
        determinationCode: string
        lines: Array<{ side: string; glAccountId: string }>
    }) {
        if (!rule.lines?.length) {
            throw new BadRequestException(
                `Account determination ${rule.determinationCode} has no account lines.`,
            )
        }
        const hasDebit = rule.lines.some((line) => line.side === 'DEBIT')
        const hasCredit = rule.lines.some((line) => line.side === 'CREDIT')
        if (!hasDebit || !hasCredit) {
            throw new BadRequestException(
                `Account determination ${rule.determinationCode} needs at least one debit and one credit line.`,
            )
        }
        return true
    }

    private async assertNoActiveClone(rule: {
        id: string
        companyId: string
        sourceModule: string
        transactionType: string
        determinationCode: string
        valuationClassId: string | null
        materialTypeCode: string | null
        movementType: string | null
        customerAccountGroup: string | null
        salesOrganization: string | null
        distributionChannel: string | null
    }) {
        const active = await this.prisma.ficoAccountDeterminationRule.findMany({
            where: {
                companyId: rule.companyId,
                sourceModule: rule.sourceModule,
                transactionType: rule.transactionType,
                status: 'ACTIVE',
                NOT: { id: rule.id },
            },
            select: {
                determinationCode: true,
                valuationClassId: true,
                materialTypeCode: true,
                movementType: true,
                customerAccountGroup: true,
                salesOrganization: true,
                distributionChannel: true,
            },
        })
        const signature = this.dimensionSignature(rule)
        const clash = active.find(
            (candidate) => this.dimensionSignature(candidate) === signature,
        )
        if (clash) {
            throw new ConflictException(
                `Determination ${clash.determinationCode} is already active for ${rule.transactionType} with the same dimensions. Deactivate it first.`,
            )
        }
    }

    private dimensionSignature(input: {
        valuationClassId: string | null
        materialTypeCode: string | null
        movementType: string | null
        customerAccountGroup: string | null
        salesOrganization: string | null
        distributionChannel: string | null
    }) {
        return FICO_DETERMINATION_DIMENSIONS.map((dimension: FicoDeterminationDimension) =>
            dimension === 'valuationClassId'
                ? (input[dimension] ?? '')
                : (normalise(input[dimension]) ?? ''),
        ).join('|')
    }

    private assertModuleAndType(sourceModule: string, transactionType: string) {
        if (!(FICO_DETERMINATION_SOURCE_MODULES as readonly string[]).includes(sourceModule)) {
            throw new BadRequestException(
                `Account determination supports only ${FICO_DETERMINATION_SOURCE_MODULES.join(', ')} source modules.`,
            )
        }
        const allowed = ficoDeterminationTypesForModule(sourceModule).map(
            (entry) => entry.code,
        )
        if (!allowed.includes(transactionType)) {
            throw new BadRequestException(
                `${transactionType} is not an ${sourceModule} transaction type.`,
            )
        }
    }

    private assertModuleDimensions(
        sourceModule: string,
        input: {
            valuationClassId?: string | null
            materialTypeCode?: string | null
            movementType?: string | null
            customerAccountGroup?: string | null
            salesOrganization?: string | null
            distributionChannel?: string | null
        },
    ) {
        if (
            (FICO_MATERIAL_DIMENSION_MODULES as readonly string[]).includes(sourceModule) &&
            (input.customerAccountGroup || input.salesOrganization || input.distributionChannel)
        ) {
            throw new BadRequestException(
                'Customer account group, sales organization and distribution channel are SD dimensions.',
            )
        }
        if (
            (FICO_SALES_DIMENSION_MODULES as readonly string[]).includes(sourceModule) &&
            (input.valuationClassId || input.materialTypeCode || input.movementType)
        ) {
            throw new BadRequestException(
                'Valuation class, material type and movement type are material dimensions used by MM and PP.',
            )
        }
    }

    private async normaliseLines(
        companyId: string,
        lines: DeterminationLineInput[],
        effectiveFrom: Date | null,
    ) {
        if (!Array.isArray(lines) || lines.length < 2) {
            throw new BadRequestException(
                'An account determination needs at least one debit and one credit line.',
            )
        }
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId },
            select: { chartOfAccountsId: true, baseCurrency: true, status: true },
        })
        if (!settings?.chartOfAccountsId) {
            throw new BadRequestException(
                'Assign a chart of accounts to the company before configuring account determination.',
            )
        }
        const seen = new Set<string>()
        const normalised: Array<{
            lineNumber: number
            side: string
            glAccountId: string
            description: string | null
        }> = []
        for (const [index, line] of lines.entries()) {
            const side = normalise(line.side)
            if (side !== 'DEBIT' && side !== 'CREDIT') {
                throw new BadRequestException(`Line ${index + 1} has an invalid side.`)
            }
            const key = `${side}:${line.glAccountId}`
            if (seen.has(key)) {
                throw new BadRequestException(
                    `Line ${index + 1} repeats the same ${side.toLowerCase()} account.`,
                )
            }
            seen.add(key)
            await this.postingValidation.assertAccountPostable(
                companyId,
                line.glAccountId,
                'AUTOMATIC',
                (settings.baseCurrency || 'PHP').toUpperCase(),
                settings.chartOfAccountsId,
                effectiveFrom ?? new Date(),
            )
            normalised.push({
                lineNumber: index + 1,
                side,
                glAccountId: line.glAccountId,
                description: line.description?.trim() || null,
            })
        }
        if (
            !normalised.some((line) => line.side === 'DEBIT') ||
            !normalised.some((line) => line.side === 'CREDIT')
        ) {
            throw new BadRequestException(
                'An account determination needs at least one debit and one credit line.',
            )
        }
        return normalised
    }

    private snapshot(rule: {
        determinationCode: string
        name: string
        status: string
        priority: number
        sourceModule: string
        transactionType: string
        effectiveFrom: Date | null
        effectiveTo: Date | null
        valuationClassId: string | null
        materialTypeCode: string | null
        movementType: string | null
        customerAccountGroup: string | null
        salesOrganization: string | null
        distributionChannel: string | null
        rejectionReason?: string | null
        lines?: Array<{ side: string; glAccountId: string; lineNumber: number }>
    }) {
        return {
            determinationCode: rule.determinationCode,
            name: rule.name,
            status: rule.status,
            priority: rule.priority,
            sourceModule: rule.sourceModule,
            transactionType: rule.transactionType,
            effectiveFrom: rule.effectiveFrom
                ? rule.effectiveFrom.toISOString().slice(0, 10)
                : null,
            effectiveTo: rule.effectiveTo
                ? rule.effectiveTo.toISOString().slice(0, 10)
                : null,
            valuationClassId: rule.valuationClassId,
            materialTypeCode: rule.materialTypeCode,
            movementType: rule.movementType,
            customerAccountGroup: rule.customerAccountGroup,
            salesOrganization: rule.salesOrganization,
            distributionChannel: rule.distributionChannel,
            rejectionReason: rule.rejectionReason ?? null,
            lines: (rule.lines ?? []).map((line) => ({
                lineNumber: line.lineNumber,
                side: line.side,
                glAccountId: line.glAccountId,
            })),
        }
    }
}
