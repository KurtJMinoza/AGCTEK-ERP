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
import { FicoAccountDeterminationValidationService } from './fico-account-determination-validation.service'
import { FicoPostingValidationService } from './fico-posting-validation.service'
import {
    FICO_DETERMINATION_ID_DIMENSIONS,
    persistenceFromExtendedDimensions,
} from './fico-determination-dimension.util'
import {
    FICO_TREASURY_PAYMENT_METHOD_HINTS,
    FICO_TREASURY_SETTLEMENT_EXAMPLE,
} from './fico-treasury-payment-determination.policy'
import { FICO_AA_ASSET_CLASS_HINTS } from './fico-aa-account-determination.policy'
import {
    FICO_PP_CO_ACCOUNTING_FLOW,
    FICO_PP_CO_FLOW_NARRATIVE,
} from './fico-pp-co-account-determination.policy'
import { ficoRuleAuthoringDimensions } from './fico-rule-authoring-dimensions.policy'
import {
    FICO_LIVE_TRANSACTION_KEY_CODES,
    FICO_TRANSACTION_KEY_CATALOG,
} from './fico-transaction-key.catalog'
import { FICO_ACCOUNTING_ERROR_CODES } from './fico-accounting-event.constants'
import {
    ficoAssertAccountTypeForCategory,
    ficoCatalogEntryForKey,
    FICO_ACCOUNTING_CATEGORY_GL_TYPES,
} from './fico-account-determination-policy'
import { FicoDeterminationSodPolicy } from './fico-determination-sod.policy'
import { randomUUID } from 'node:crypto'

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
    paymentMethodCode?: string | null
    bankAccountId?: string | null
    paymentProviderCode?: string | null
    currencyCode?: string | null
    branchId?: string | null
    assetClassCode?: string | null
    depreciationAreaCode?: string | null
    documentTypeCode?: string | null
    productionOrderTypeCode?: string | null
    costElementCategoryCode?: string | null
    controllingAreaCode?: string | null
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
    transactionKeyCode?: string
    glAccountId?: string
    status?: string
    effectiveOn?: string
    accountingCategory?: string
    /** COMPLETE = has a transaction key and both sides; INCOMPLETE = missing either. */
    completeness?: string
    search?: string
    sortBy?: string
    sortDir?: 'asc' | 'desc'
    page?: number
    pageSize?: number
}

const SORTABLE_RULE_FIELDS = new Set([
    'determinationCode',
    'name',
    'priority',
    'status',
    'sourceModule',
    'transactionType',
    'transactionKeyCode',
    'effectiveFrom',
    'effectiveTo',
    'updatedAt',
])

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
        private readonly determinationValidation: FicoAccountDeterminationValidationService,
        private readonly sod: FicoDeterminationSodPolicy,
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
        const effectiveOn = query.effectiveOn
            ? toDate(query.effectiveOn, 'effective date filter')
            : null
        const categoryKeys = query.accountingCategory
            ? FICO_TRANSACTION_KEY_CATALOG.filter(
                  (entry) =>
                      entry.accountingCategory.toUpperCase() ===
                      query.accountingCategory!.trim().toUpperCase(),
              ).map((entry) => entry.code)
            : null

        const where: Prisma.FicoAccountDeterminationRuleWhereInput = {
            companyId,
            ...(query.sourceModule ? { sourceModule: query.sourceModule } : {}),
            ...(query.transactionType ? { transactionType: query.transactionType } : {}),
            ...(query.transactionKeyCode
                ? { transactionKeyCode: query.transactionKeyCode.trim().toUpperCase() }
                : {}),
            ...(query.status ? { status: query.status } : {}),
            ...(query.glAccountId
                ? { lines: { some: { glAccountId: query.glAccountId } } }
                : {}),
            ...(categoryKeys ? { transactionKeyCode: { in: categoryKeys } } : {}),
            ...(query.completeness === 'INCOMPLETE'
                ? { transactionKeyCode: null }
                : query.completeness === 'COMPLETE'
                  ? { transactionKeyCode: { not: null } }
                  : {}),
            ...(effectiveOn
                ? {
                      AND: [
                          {
                              OR: [
                                  { effectiveFrom: null },
                                  { effectiveFrom: { lte: effectiveOn } },
                              ],
                          },
                          {
                              OR: [
                                  { effectiveTo: null },
                                  { effectiveTo: { gte: effectiveOn } },
                              ],
                          },
                      ],
                  }
                : {}),
            ...(search
                ? {
                      OR: [
                          { determinationCode: { contains: search, mode: 'insensitive' } },
                          { name: { contains: search, mode: 'insensitive' } },
                          { transactionKeyCode: { contains: search, mode: 'insensitive' } },
                      ],
                  }
                : {}),
        }

        const sortBy =
            query.sortBy && SORTABLE_RULE_FIELDS.has(query.sortBy)
                ? query.sortBy
                : null
        const sortDir = query.sortDir === 'desc' ? 'desc' : 'asc'
        const orderBy: Prisma.FicoAccountDeterminationRuleOrderByWithRelationInput[] =
            sortBy
                ? [{ [sortBy]: sortDir } as never, { determinationCode: 'asc' }]
                : [{ priority: 'asc' }, { determinationCode: 'asc' }]

        const [items, total] = await Promise.all([
            this.prisma.ficoAccountDeterminationRule.findMany({
                where,
                include: RULE_INCLUDE,
                orderBy,
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
            approved: byStatus.APPROVED ?? 0,
            inactive: byStatus.INACTIVE ?? 0,
        }
    }

    async workbenchOverview(companyId: string, user: AuthRequestUser) {
        await this.access.assertAccess(user, companyId)
        const summary = await this.overview({ companyId }, user)
        const today = new Date(
            Date.UTC(
                new Date().getUTCFullYear(),
                new Date().getUTCMonth(),
                new Date().getUTCDate(),
            ),
        )

        const [
            scheduledRules,
            settings,
            failedResolutionEvents,
            pendingAccountingEvents,
            invalidRuleCount,
            activeKeyCount,
        ] = await Promise.all([
            this.prisma.ficoAccountDeterminationRule.count({
                where: {
                    companyId,
                    status: { in: ['APPROVED', 'ACTIVE', 'INACTIVE'] },
                    effectiveFrom: { gt: today },
                },
            }),
            this.prisma.ficoCompanyAccountingSettings.findUnique({
                where: { companyId },
                select: {
                    status: true,
                    accountDeterminationProfileId: true,
                    chartOfAccountsId: true,
                },
            }),
            this.prisma.mmAccountingEvent.count({
                where: {
                    companyId,
                    OR: [
                        { lastErrorCode: FICO_ACCOUNTING_ERROR_CODES.DETERMINATION },
                        {
                            status: 'PENDING',
                            lastErrorCode: {
                                in: [
                                    FICO_ACCOUNTING_ERROR_CODES.DETERMINATION,
                                    FICO_ACCOUNTING_ERROR_CODES.VALIDATION,
                                ],
                            },
                        },
                    ],
                },
            }),
            this.prisma.mmAccountingEvent.count({
                where: { companyId, status: 'PENDING' },
            }),
            this.prisma.ficoAccountDeterminationRule.count({
                where: {
                    companyId,
                    lines: {
                        some: {
                            glAccount: { status: { not: 'ACTIVE' } },
                        },
                    },
                },
            }),
            this.prisma.ficoAccountDeterminationRule.count({
                where: {
                    companyId,
                    status: 'ACTIVE',
                    transactionKeyCode: { not: null },
                },
            }),
        ])

        const missingProfile = !settings?.accountDeterminationProfileId
        const liveKeys = FICO_LIVE_TRANSACTION_KEY_CODES.length
        const moduleCoverage = FICO_TRANSACTION_KEY_CATALOG.filter(
            (entry) => entry.integrationStatus === 'LIVE',
        ).map((entry) => ({
            transactionKeyCode: entry.code,
            integrationStatus: entry.integrationStatus,
            hasActiveRule: false,
        }))

        const activeRulesWithKeys = await this.prisma.ficoAccountDeterminationRule.findMany({
            where: {
                companyId,
                status: 'ACTIVE',
                transactionKeyCode: { not: null },
            },
            select: { transactionKeyCode: true },
            distinct: ['transactionKeyCode'],
        })
        const keyed = new Set(
            activeRulesWithKeys
                .map((row) => row.transactionKeyCode)
                .filter((value): value is string => !!value),
        )
        for (const row of moduleCoverage) {
            row.hasActiveRule = keyed.has(row.transactionKeyCode)
        }

        const missingLiveKeyRules = moduleCoverage.filter((row) => !row.hasActiveRule).length

        return {
            ...summary,
            scheduledRules,
            missingAccountDeterminationProfile: missingProfile,
            companyAccountingInactive: settings?.status !== 'ACTIVE',
            failedAccountResolutionEvents: failedResolutionEvents,
            pendingAccountingEvents,
            invalidGlReferencesInRules: invalidRuleCount,
            liveTransactionKeys: liveKeys,
            activeRulesWithTransactionKey: activeKeyCount,
            missingLiveTransactionKeyRules: missingLiveKeyRules,
            moduleCoverage,
        }
    }

    async duplicateAsDraft(ruleId: string, user: AuthRequestUser) {
        const existing = await this.findRule(ruleId)
        await this.access.assertAccess(user, existing.companyId)
        const suffix = Date.now().toString(36).toUpperCase()
        const determinationCode = `${existing.determinationCode}-COPY-${suffix}`.slice(0, 32)
        const input: CreateDeterminationInput = {
            determinationCode,
            name: `${existing.name} (copy)`,
            description: existing.description,
            companyId: existing.companyId,
            sourceModule: existing.sourceModule,
            transactionType: existing.transactionType,
            transactionKeyCode: existing.transactionKeyCode,
            priority: existing.priority,
            effectiveFrom: existing.effectiveFrom
                ? existing.effectiveFrom.toISOString().slice(0, 10)
                : null,
            effectiveTo: existing.effectiveTo
                ? existing.effectiveTo.toISOString().slice(0, 10)
                : null,
            valuationClassId: existing.valuationClassId,
            materialTypeCode: existing.materialTypeCode,
            movementType: existing.movementType,
            customerAccountGroup: existing.customerAccountGroup,
            salesOrganization: existing.salesOrganization,
            distributionChannel: existing.distributionChannel,
            paymentMethodCode: existing.paymentMethodCode,
            bankAccountId: existing.bankAccountId,
            paymentProviderCode: existing.paymentProviderCode,
            currencyCode: existing.currencyCode,
            branchId: existing.branchId,
            assetClassCode: existing.assetClassCode,
            depreciationAreaCode: existing.depreciationAreaCode,
            documentTypeCode: existing.documentTypeCode,
            productionOrderTypeCode: existing.productionOrderTypeCode,
            costElementCategoryCode: existing.costElementCategoryCode,
            controllingAreaCode: existing.controllingAreaCode,
            changeReason: 'Duplicated from existing rule',
            lines: existing.lines.map((line) => ({
                side: line.side,
                glAccountId: line.glAccountId,
                description: line.description,
            })),
        }
        const created = await this.create(input, user)
        await this.audit.log({
            companyId: existing.companyId,
            actorId: user.id,
            action: FICO_DETERMINATION_AUDIT_ACTIONS.DUPLICATE,
            entityType: FICO_DETERMINATION_ENTITY_TYPE,
            entityId: created.id,
            previousValues: this.snapshot(existing),
            newValues: this.snapshot(created),
            metadata: {
                correlationId: randomUUID(),
                sourceRuleId: existing.id,
                sourceRuleCode: existing.determinationCode,
            },
        })
        return created
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
            paymentMethodHints: FICO_TREASURY_PAYMENT_METHOD_HINTS,
            treasurySettlementExample: FICO_TREASURY_SETTLEMENT_EXAMPLE,
            assetClassHints: FICO_AA_ASSET_CLASS_HINTS,
            productionCostingFlow: {
                keys: [...FICO_PP_CO_ACCOUNTING_FLOW],
                narrative: FICO_PP_CO_FLOW_NARRATIVE,
            },
            authoringDimensionsByModule: Object.fromEntries(
                FICO_DETERMINATION_SOURCE_MODULES.map((code) => [
                    code,
                    ficoRuleAuthoringDimensions(code),
                ]),
            ),
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
        const extended = persistenceFromExtendedDimensions(input)

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
                ...extended,
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
                    ...(input.paymentMethodCode !== undefined ||
                    input.bankAccountId !== undefined ||
                    input.paymentProviderCode !== undefined ||
                    input.currencyCode !== undefined ||
                    input.branchId !== undefined ||
                    input.assetClassCode !== undefined ||
                    input.depreciationAreaCode !== undefined ||
                    input.documentTypeCode !== undefined ||
                    input.productionOrderTypeCode !== undefined ||
                    input.costElementCategoryCode !== undefined ||
                    input.controllingAreaCode !== undefined
                        ? persistenceFromExtendedDimensions({
                              paymentMethodCode: input.paymentMethodCode,
                              bankAccountId: input.bankAccountId,
                              paymentProviderCode: input.paymentProviderCode,
                              currencyCode: input.currencyCode,
                              branchId: input.branchId,
                              assetClassCode: input.assetClassCode,
                              depreciationAreaCode: input.depreciationAreaCode,
                              documentTypeCode: input.documentTypeCode,
                              productionOrderTypeCode: input.productionOrderTypeCode,
                              costElementCategoryCode: input.costElementCategoryCode,
                              controllingAreaCode: input.controllingAreaCode,
                          })
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
        const existing = await this.findRule(id)
        await this.access.assertAccess(user, existing.companyId)
        await this.sod.assertCanApprove(existing, user.id)
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
        await this.sod.assertCanActivate(existing, user.id)
        this.assertPostableLines(existing)
        await this.assertNoActiveClone(existing)
        await this.determinationValidation.assertSafeToActivate(
            existing as never,
        )

        const correlationId = randomUUID()
        // Activation and its audit record commit together (04.28).
        const updated = await this.prisma.$transaction(async (tx) => {
            const row = await tx.ficoAccountDeterminationRule.update({
                where: { id, status: existing.status },
                data: {
                    status: 'ACTIVE',
                    activatedBy: user.id,
                    activatedAt: new Date(),
                    updatedBy: user.id,
                },
                include: RULE_INCLUDE,
            })
            await this.audit.log(
                {
                    companyId: row.companyId,
                    actorId: user.id,
                    action: FICO_DETERMINATION_AUDIT_ACTIONS.ACTIVATE,
                    entityType: FICO_DETERMINATION_ENTITY_TYPE,
                    entityId: row.id,
                    previousValues: this.snapshot(existing),
                    newValues: this.snapshot(row),
                    metadata: {
                        correlationId,
                        ruleVersion: row.updatedAt.getTime(),
                        determinationCode: row.determinationCode,
                    },
                },
                tx,
            )
            return row
        })
        return updated
    }

    /**
     * Phase 04.26 — replacement version: closes the active rule's validity and
     * opens a draft successor. Historical journals are never touched.
     */
    async newVersion(
        id: string,
        input: { effectiveFrom?: string; changeReason?: string },
        user: AuthRequestUser,
    ) {
        const existing = await this.findRule(id)
        await this.access.assertAccess(user, existing.companyId)
        if (!['ACTIVE', 'APPROVED', 'INACTIVE'].includes(existing.status)) {
            throw new BadRequestException(
                `Only approved, active or inactive rules can be replaced. ${existing.determinationCode} is ${existing.status}.`,
            )
        }
        const from = toDate(input.effectiveFrom, 'effective from date') ?? new Date()
        const successorFrom = new Date(
            Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
        )
        const predecessorTo = new Date(successorFrom)
        predecessorTo.setUTCDate(predecessorTo.getUTCDate() - 1)

        const nextVersion = await this.nextVersionCode(existing.determinationCode)
        const correlationId = randomUUID()

        const draft = await this.create(
            {
                determinationCode: nextVersion,
                name: existing.name,
                description: existing.description,
                companyId: existing.companyId,
                sourceModule: existing.sourceModule,
                transactionType: existing.transactionType,
                transactionKeyCode: existing.transactionKeyCode,
                priority: existing.priority,
                effectiveFrom: successorFrom.toISOString().slice(0, 10),
                effectiveTo: existing.effectiveTo
                    ? existing.effectiveTo.toISOString().slice(0, 10)
                    : null,
                valuationClassId: existing.valuationClassId,
                materialTypeCode: existing.materialTypeCode,
                movementType: existing.movementType,
                customerAccountGroup: existing.customerAccountGroup,
                salesOrganization: existing.salesOrganization,
                distributionChannel: existing.distributionChannel,
                paymentMethodCode: existing.paymentMethodCode,
                bankAccountId: existing.bankAccountId,
                paymentProviderCode: existing.paymentProviderCode,
                currencyCode: existing.currencyCode,
                branchId: existing.branchId,
                assetClassCode: existing.assetClassCode,
                depreciationAreaCode: existing.depreciationAreaCode,
                documentTypeCode: existing.documentTypeCode,
                productionOrderTypeCode: existing.productionOrderTypeCode,
                costElementCategoryCode: existing.costElementCategoryCode,
                controllingAreaCode: existing.controllingAreaCode,
                changeReason:
                    input.changeReason ?? `Replacement version of ${existing.determinationCode}`,
                lines: existing.lines.map((line) => ({
                    side: line.side,
                    glAccountId: line.glAccountId,
                    description: line.description,
                })),
            },
            user,
        )

        await this.audit.log({
            companyId: existing.companyId,
            actorId: user.id,
            action: FICO_DETERMINATION_AUDIT_ACTIONS.NEW_VERSION,
            entityType: FICO_DETERMINATION_ENTITY_TYPE,
            entityId: existing.id,
            previousValues: this.snapshot(existing),
            newValues: {
                successorRuleId: draft.id,
                successorCode: draft.determinationCode,
                predecessorEffectiveTo: predecessorTo.toISOString().slice(0, 10),
            },
            reason: input.changeReason ?? null,
            metadata: { correlationId, ruleVersion: existing.updatedAt.getTime() },
        })

        return {
            predecessor: {
                id: existing.id,
                determinationCode: existing.determinationCode,
                proposedEffectiveTo: predecessorTo.toISOString().slice(0, 10),
            },
            successor: draft,
            note: 'The predecessor stays active until you set its effective-to date or deactivate it. Historical journals are unaffected.',
        }
    }

    /** Where a determination rule or G/L account is actually used (04.26). */
    async usage(
        query: { companyId: string; glAccountId?: string; transactionKeyCode?: string },
        user: AuthRequestUser,
    ) {
        if (!query.companyId) {
            throw new BadRequestException('companyId is required.')
        }
        await this.access.assertAccess(user, query.companyId)
        const where: Prisma.FicoAccountDeterminationRuleWhereInput = {
            companyId: query.companyId,
            ...(query.transactionKeyCode
                ? { transactionKeyCode: query.transactionKeyCode.trim().toUpperCase() }
                : {}),
            ...(query.glAccountId
                ? { lines: { some: { glAccountId: query.glAccountId } } }
                : {}),
        }
        const [rules, legacyMappings, journalCount] = await Promise.all([
            this.prisma.ficoAccountDeterminationRule.findMany({
                where,
                select: {
                    id: true,
                    determinationCode: true,
                    name: true,
                    status: true,
                    sourceModule: true,
                    transactionType: true,
                    transactionKeyCode: true,
                    priority: true,
                    updatedAt: true,
                },
                orderBy: [{ status: 'asc' }, { priority: 'asc' }],
                take: 200,
            }),
            this.prisma.ficoMmAccountMapping.count({
                where: {
                    companyId: query.companyId,
                    ...(query.transactionKeyCode
                        ? { transactionKeyCode: query.transactionKeyCode.trim().toUpperCase() }
                        : {}),
                    ...(query.glAccountId
                        ? {
                              OR: [
                                  { debitAccountId: query.glAccountId },
                                  { creditAccountId: query.glAccountId },
                              ],
                          }
                        : {}),
                },
            }),
            query.glAccountId
                ? this.prisma.ficoJournalEntryLine.count({
                      where: {
                          companyId: query.companyId,
                          glAccountId: query.glAccountId,
                      },
                  })
                : Promise.resolve(0),
        ])
        return {
            companyId: query.companyId,
            rules,
            legacyMappingCount: legacyMappings,
            postedJournalLineCount: journalCount,
        }
    }

    /** Live transaction-key coverage per module (04.26 module-coverage). */
    async moduleCoverage(companyId: string, user: AuthRequestUser) {
        await this.access.assertAccess(user, companyId)
        const activeRules = await this.prisma.ficoAccountDeterminationRule.findMany({
            where: { companyId, status: 'ACTIVE' },
            select: { transactionKeyCode: true, sourceModule: true },
        })
        const covered = new Set(
            activeRules
                .map((row) => row.transactionKeyCode)
                .filter((code): code is string => !!code),
        )
        const keys = FICO_TRANSACTION_KEY_CATALOG.map((entry) => ({
            transactionKeyCode: entry.code,
            name: entry.name,
            owningModule: entry.owningModule,
            accountingCategory: entry.accountingCategory,
            integrationStatus: entry.integrationStatus,
            hasActiveRule: covered.has(entry.code),
        }))
        const byModule: Record<
            string,
            { total: number; live: number; covered: number; liveCovered: number }
        > = {}
        for (const key of keys) {
            const bucket = (byModule[key.owningModule] ??= {
                total: 0,
                live: 0,
                covered: 0,
                liveCovered: 0,
            })
            bucket.total += 1
            if (key.hasActiveRule) bucket.covered += 1
            if (key.integrationStatus === 'LIVE') {
                bucket.live += 1
                if (key.hasActiveRule) bucket.liveCovered += 1
            }
        }
        return {
            companyId,
            liveTransactionKeys: FICO_LIVE_TRANSACTION_KEY_CODES.length,
            keys,
            byModule,
        }
    }

    private async nextVersionCode(baseCode: string) {
        const root = baseCode.replace(/-V\d+$/i, '')
        const existing = await this.prisma.ficoAccountDeterminationRule.findMany({
            where: { determinationCode: { startsWith: root } },
            select: { determinationCode: true },
        })
        let max = 1
        for (const row of existing) {
            const match = /-V(\d+)$/i.exec(row.determinationCode)
            if (match) max = Math.max(max, Number(match[1]))
        }
        return `${root}-V${max + 1}`.slice(0, 32)
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
        transactionKeyCode?: string | null
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
                transactionKeyCode: true,
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

    private dimensionSignature(
        input: Partial<Record<FicoDeterminationDimension, string | null>> & {
            transactionKeyCode?: string | null
        },
    ) {
        const key = (input.transactionKeyCode ?? '').trim().toUpperCase()
        const body = FICO_DETERMINATION_DIMENSIONS.map((dimension: FicoDeterminationDimension) =>
            (FICO_DETERMINATION_ID_DIMENSIONS as readonly string[]).includes(dimension)
                ? (input[dimension] ?? '')
                : (normalise(input[dimension]) ?? ''),
        ).join('|')
        return `${key}|${body}`
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
    } & Partial<Record<FicoDeterminationDimension, string | null>>) {
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
            paymentMethodCode: rule.paymentMethodCode ?? null,
            bankAccountId: rule.bankAccountId ?? null,
            paymentProviderCode: rule.paymentProviderCode ?? null,
            currencyCode: rule.currencyCode ?? null,
            branchId: rule.branchId ?? null,
            assetClassCode: rule.assetClassCode ?? null,
            depreciationAreaCode: rule.depreciationAreaCode ?? null,
            documentTypeCode: rule.documentTypeCode ?? null,
            productionOrderTypeCode: rule.productionOrderTypeCode ?? null,
            costElementCategoryCode: rule.costElementCategoryCode ?? null,
            controllingAreaCode: rule.controllingAreaCode ?? null,
            rejectionReason: rule.rejectionReason ?? null,
            lines: (rule.lines ?? []).map((line) => ({
                lineNumber: line.lineNumber,
                side: line.side,
                glAccountId: line.glAccountId,
            })),
        }
    }

    async validateDraft(input: CreateDeterminationInput, user: AuthRequestUser) {
        await this.access.assertAccess(user, input.companyId)
        const sourceModule = normalise(input.sourceModule) ?? ''
        const transactionType = normalise(input.transactionType) ?? ''
        this.assertModuleAndType(sourceModule, transactionType)
        this.assertModuleDimensions(sourceModule, input)
        const effectiveFrom = toDate(input.effectiveFrom, 'effective from date')
        const errors: string[] = []
        const warnings: string[] = []

        try {
            const lines = await this.normaliseLines(
                input.companyId,
                input.lines,
                effectiveFrom,
            )
            const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
                where: { companyId: input.companyId },
                select: { chartOfAccountsId: true, baseCurrency: true },
            })
            const keyEntry = input.transactionKeyCode
                ? ficoCatalogEntryForKey(input.transactionKeyCode)
                : undefined
            const glRows = await this.prisma.ficoGlAccount.findMany({
                where: { id: { in: lines.map((line) => line.glAccountId) } },
                select: {
                    id: true,
                    accountCode: true,
                    accountType: true,
                    status: true,
                },
            })
            for (const line of lines) {
                const account = glRows.find((row) => row.id === line.glAccountId)
                if (!account) {
                    errors.push(`Line ${line.lineNumber}: G/L account not found.`)
                    continue
                }
                if (account.status !== 'ACTIVE') {
                    errors.push(
                        `Line ${line.lineNumber}: ${account.accountCode} is not active.`,
                    )
                }
                if (keyEntry) {
                    try {
                        ficoAssertAccountTypeForCategory(
                            keyEntry.accountingCategory,
                            account.accountType,
                            account.accountCode,
                        )
                    } catch (error) {
                        errors.push(
                            error instanceof Error
                                ? error.message
                                : `Line ${line.lineNumber}: incompatible account type.`,
                        )
                    }
                }
            }
            if (settings?.chartOfAccountsId) {
                await this.determinationValidation.assertRuleAccountsEligible(
                    {
                        id: 'DRAFT_VALIDATION',
                        companyId: input.companyId,
                        determinationCode: input.determinationCode,
                        sourceModule,
                        transactionType,
                        transactionKeyCode: input.transactionKeyCode ?? null,
                        priority: input.priority ?? 100,
                        effectiveFrom,
                        effectiveTo: toDate(input.effectiveTo, 'effective to date'),
                        status: 'DRAFT',
                        valuationClassId: input.valuationClassId ?? null,
                        materialTypeCode: input.materialTypeCode ?? null,
                        movementType: normalise(input.movementType),
                        customerAccountGroup: normalise(input.customerAccountGroup),
                        salesOrganization: normalise(input.salesOrganization),
                        distributionChannel: normalise(input.distributionChannel),
                        paymentMethodCode: input.paymentMethodCode ?? null,
                        bankAccountId: input.bankAccountId ?? null,
                        paymentProviderCode: input.paymentProviderCode ?? null,
                        currencyCode: input.currencyCode ?? null,
                        branchId: input.branchId ?? null,
                        assetClassCode: input.assetClassCode ?? null,
                        depreciationAreaCode: input.depreciationAreaCode ?? null,
                        documentTypeCode: input.documentTypeCode ?? null,
                        productionOrderTypeCode: input.productionOrderTypeCode ?? null,
                        costElementCategoryCode: input.costElementCategoryCode ?? null,
                        controllingAreaCode: input.controllingAreaCode ?? null,
                        lines: lines.map((line, index) => ({
                            lineNumber: index + 1,
                            side: line.side,
                            glAccountId: line.glAccountId,
                            glAccount: glRows.find((row) => row.id === line.glAccountId)!,
                        })),
                    } as never,
                    settings.chartOfAccountsId,
                    (settings.baseCurrency || 'PHP').toUpperCase(),
                )
            }
        } catch (error) {
            errors.push(error instanceof Error ? error.message : 'Validation failed.')
        }

        if (!input.transactionKeyCode) {
            warnings.push('Transaction key is not set — production resolution may be ambiguous.')
        }
        return { ok: errors.length === 0, errors, warnings }
    }

    /** Validate a persisted rule without changing its lifecycle state (04.26). */
    async validateExisting(id: string, user: AuthRequestUser) {
        const rule = await this.findRule(id)
        await this.access.assertAccess(user, rule.companyId)
        const errors: string[] = []
        const warnings: string[] = []

        try {
            this.assertPostableLines(rule)
        } catch (error) {
            errors.push(error instanceof Error ? error.message : 'Invalid posting lines.')
        }
        try {
            await this.determinationValidation.assertSafeToActivate(rule as never)
        } catch (error) {
            errors.push(error instanceof Error ? error.message : 'Rule is not safe to activate.')
        }
        if (!rule.transactionKeyCode) {
            warnings.push(
                'No transaction key is assigned; this rule competes only on transaction type and dimensions.',
            )
        }
        if (rule.effectiveTo && rule.effectiveTo < new Date()) {
            warnings.push('The effective-to date is in the past; this rule can no longer resolve.')
        }

        await this.audit.log({
            companyId: rule.companyId,
            actorId: user.id,
            action: FICO_DETERMINATION_AUDIT_ACTIONS.VALIDATE,
            entityType: FICO_DETERMINATION_ENTITY_TYPE,
            entityId: rule.id,
            newValues: { ok: errors.length === 0, errors, warnings },
            metadata: { correlationId: randomUUID(), ruleVersion: rule.updatedAt.getTime() },
        })

        return {
            ruleId: rule.id,
            determinationCode: rule.determinationCode,
            status: rule.status,
            ok: errors.length === 0,
            errors,
            warnings,
        }
    }

    async listEligibleGlAccounts(
        companyId: string,
        user: AuthRequestUser,
        query: { search?: string; transactionKeyCode?: string },
    ) {
        await this.access.assertAccess(user, companyId)
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId },
            select: { chartOfAccountsId: true, baseCurrency: true },
        })
        if (!settings?.chartOfAccountsId) {
            throw new BadRequestException(
                'Company chart of accounts is not configured.',
            )
        }
        const search = query.search?.trim()
        const keyEntry = query.transactionKeyCode
            ? ficoCatalogEntryForKey(query.transactionKeyCode)
            : undefined
        const allowedTypes = keyEntry
            ? FICO_ACCOUNTING_CATEGORY_GL_TYPES[keyEntry.accountingCategory.toUpperCase()]
            : null

        const rows = await this.prisma.ficoCompanyGlAccount.findMany({
            where: {
                companyId,
                glAccount: {
                    chartOfAccountsId: settings.chartOfAccountsId,
                    isPostingAccount: true,
                    allowAutomaticPosting: true,
                    status: 'ACTIVE',
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
                },
            },
            include: {
                glAccount: {
                    include: { accountGroup: { select: { code: true, name: true } } },
                },
            },
            take: 100,
            orderBy: { glAccount: { accountCode: 'asc' } },
        })

        return rows
            .map((row) => {
                const account = row.glAccount
                const typeAllowed =
                    !allowedTypes ||
                    allowedTypes.includes(account.accountType.toUpperCase())
                return {
                    id: account.id,
                    accountCode: account.accountCode,
                    accountName: account.accountName,
                    accountType: account.accountType,
                    accountGroupCode: account.accountGroup.code,
                    normalBalance: account.normalBalance,
                    companyAssignment: true,
                    postingEligible:
                        account.isPostingAccount &&
                        account.allowAutomaticPosting &&
                        account.status === 'ACTIVE',
                    reconciliationType: account.reconciliationType,
                    isReconciliationAccount: account.isReconciliationAccount,
                    status: account.status,
                    categoryEligible: typeAllowed,
                }
            })
            .filter((row) => row.categoryEligible)
    }
}
