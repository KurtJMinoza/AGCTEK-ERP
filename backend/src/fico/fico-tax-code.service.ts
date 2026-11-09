import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import {
    FICO_TAX_AUDIT_ACTIONS,
    isFicoTaxCalculationMethod,
    isFicoTaxCodeCategory,
    isFicoTaxCodeStatus,
    isFicoTaxCodeType,
    isFicoTaxRateUnit,
    isFicoTaxRoundingLevel,
    isFicoTaxRoundingMethod,
} from './fico.constants'
import type {
    FicoTaxCodeActivateDto,
    FicoTaxCodeCreateDto,
    FicoTaxCodeDeactivateDto,
    FicoTaxCodeDuplicateDto,
    FicoTaxCodeHistoryQueryDto,
    FicoTaxCodeListQueryDto,
    FicoTaxCodeUpdateDto,
    FicoTaxCalculationDto,
    FicoTaxCalculationResult,
    FicoTaxRateCreateDto,
    FicoTaxRateQueryDto,
    FicoTaxRateUpdateDto,
} from './dto/fico-phase1.dto'
import { FicoTaxCalculationService } from './fico-tax-calculation.service'

const Decimal = Prisma.Decimal

const MAX_DATE = new Date(Date.UTC(9999, 11, 31))
const DAY_MS = 24 * 60 * 60 * 1000

const ZERO_LIKE_TAX_TYPES = [
    'ZERO_RATED_TAX',
    'EXEMPT_TAX',
    'NON_TAXABLE',
] as const

const TAX_BEARING_TYPES = [
    'VAT',
    'PERCENTAGE_TAX',
    'WITHHOLDING_TAX',
    'OTHER_TAX',
] as const

const GL_REF_SELECT = {
    id: true,
    chartOfAccountsId: true,
    accountCode: true,
    accountName: true,
    accountType: true,
    isPostingAccount: true,
    status: true,
} as const

const TAX_CODE_INCLUDE = {
    company: { select: { id: true, code: true, name: true } },
    inputTaxGlAccount: { select: GL_REF_SELECT },
    outputTaxGlAccount: { select: GL_REF_SELECT },
    withholdingPayableGlAccount: { select: GL_REF_SELECT },
    withholdingReceivableGlAccount: { select: GL_REF_SELECT },
    nonRecoverableTaxGlAccount: { select: GL_REF_SELECT },
    taxRates: { orderBy: { effectiveFrom: 'desc' } },
} satisfies Prisma.FicoTaxCodeInclude

type TaxCodeRecord = Prisma.FicoTaxCodeGetPayload<{
    include: typeof TAX_CODE_INCLUDE
}>

type TaxRateRecord = Prisma.FicoTaxRateGetPayload<Record<string, never>>

type GlMappingField = {
    key:
        | 'inputTaxGlAccountId'
        | 'outputTaxGlAccountId'
        | 'withholdingPayableGlAccountId'
        | 'withholdingReceivableGlAccountId'
        | 'nonRecoverableTaxGlAccountId'
    label: string
    allowedAccountTypes: readonly string[]
}

const GL_MAPPING_FIELDS: readonly GlMappingField[] = [
    {
        key: 'inputTaxGlAccountId',
        label: 'Input tax',
        allowedAccountTypes: ['ASSET', 'EXPENSE'],
    },
    {
        key: 'outputTaxGlAccountId',
        label: 'Output tax',
        allowedAccountTypes: ['LIABILITY'],
    },
    {
        key: 'withholdingPayableGlAccountId',
        label: 'Withholding tax payable',
        allowedAccountTypes: ['LIABILITY'],
    },
    {
        key: 'withholdingReceivableGlAccountId',
        label: 'Withholding tax receivable',
        allowedAccountTypes: ['ASSET'],
    },
    {
        key: 'nonRecoverableTaxGlAccountId',
        label: 'Non-recoverable tax expense',
        allowedAccountTypes: ['EXPENSE'],
    },
]

type TaxCodeCreateInput = FicoTaxCodeCreateDto
type TaxCodeListQuery = FicoTaxCodeListQueryDto
type TaxCodeUpdateInput = FicoTaxCodeUpdateDto
type TaxCodeActivateInput = FicoTaxCodeActivateDto
type TaxCodeDeactivateInput = FicoTaxCodeDeactivateDto
type TaxRateCreateInput = FicoTaxRateCreateDto
type TaxRateQuery = FicoTaxRateQueryDto
type TaxRateUpdateInput = FicoTaxRateUpdateDto

function toDateOnly(value: string | Date): Date {
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            throw new BadRequestException('Invalid date value.')
        }
        return new Date(
            Date.UTC(
                value.getUTCFullYear(),
                value.getUTCMonth(),
                value.getUTCDate(),
            ),
        )
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    if (match) {
        return new Date(
            Date.UTC(
                Number(match[1]),
                Number(match[2]) - 1,
                Number(match[3]),
            ),
        )
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('Invalid date value.')
    }
    return new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    )
}

function todayUtc(): Date {
    return toDateOnly(new Date())
}

function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * DAY_MS)
}

function dateOnlyString(value: Date | string | null | undefined): string | null {
    if (value === null || value === undefined) return null
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString().slice(0, 10)
}

function normalizeCode(value: string): string {
    const code = value.trim().toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9._/-]{0,31}$/.test(code)) {
        throw new BadRequestException(
            'Tax code may contain letters, digits, dots, dashes, underscores or slashes, and must start with a letter or digit.',
        )
    }
    return code
}

function normalizeCountryCode(value: string | null | undefined) {
    if (value === undefined) return undefined
    if (value === null || value.trim() === '') return null
    const code = value.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(code)) {
        throw new BadRequestException(
            'Country code must be a two-letter ISO code.',
        )
    }
    return code
}

function rateStatusForDates(
    effectiveFrom: Date,
    effectiveTo: Date | null,
    today: Date = todayUtc(),
): string {
    if (effectiveTo && effectiveTo < today) return 'EXPIRED'
    if (effectiveFrom > today) return 'SCHEDULED'
    return 'ACTIVE'
}

function rateEffectiveStatus(rate: TaxRateRecord, today: Date): string {
    if (rate.status === 'INACTIVE') return 'INACTIVE'
    const from = toDateOnly(rate.effectiveFrom)
    if (from > today) return 'SCHEDULED'
    if (rate.effectiveTo && toDateOnly(rate.effectiveTo) < today) {
        return 'EXPIRED'
    }
    return 'ACTIVE'
}

function taxCodeEffectiveStatus(code: TaxCodeRecord, today: Date): string {
    if (code.status === 'DRAFT') return 'DRAFT'
    if (code.status === 'INACTIVE') return 'INACTIVE'
    const rates = code.taxRates.map((rate) => rateEffectiveStatus(rate, today))
    if (rates.includes('ACTIVE')) return 'ACTIVE'
    if (rates.includes('SCHEDULED')) return 'SCHEDULED'
    if (
        code.taxRates.length === 0 &&
        (ZERO_LIKE_TAX_TYPES as readonly string[]).includes(code.taxType)
    ) {
        return 'ACTIVE'
    }
    return 'EXPIRED'
}

function currentRateFilter(date: Date): Prisma.FicoTaxRateWhereInput {
    return {
        status: { not: 'INACTIVE' },
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
    }
}

/**
 * Effective status is derived from the effective-dated window, so filtering
 * must not trust the persisted status column alone (it is only a snapshot
 * taken when the rate was written).
 */
function rateStatusWhere(
    status: string,
    today: Date,
): Prisma.FicoTaxRateWhereInput {
    switch (status) {
        case 'ACTIVE':
            return currentRateFilter(today)
        case 'SCHEDULED':
            return { status: { not: 'INACTIVE' }, effectiveFrom: { gt: today } }
        case 'EXPIRED':
            return { status: { not: 'INACTIVE' }, effectiveTo: { lt: today } }
        case 'INACTIVE':
            return { status: 'INACTIVE' }
        default:
            throw new BadRequestException(
                `Invalid tax rate status filter: ${status}`,
            )
    }
}

function futureRateFilter(date: Date): Prisma.FicoTaxRateWhereInput {
    return {
        status: { not: 'INACTIVE' },
        effectiveFrom: { gt: date },
    }
}

function applicabilityDefaults(category: string) {
    switch (category) {
        case 'SALES_TAX':
        case 'OUTPUT_TAX':
            return { sales: true, purchase: false, service: false, inventory: false }
        case 'PURCHASE_TAX':
        case 'INPUT_TAX':
            return { sales: false, purchase: true, service: false, inventory: false }
        case 'WITHHOLDING_TAX':
            return { sales: false, purchase: true, service: false, inventory: false }
        default:
            return { sales: false, purchase: false, service: false, inventory: false }
    }
}

function transactionApplicability(type: string) {
    switch (type) {
        case 'SALES':
        case 'CUSTOMER_INVOICE':
            return 'isSalesApplicable' as const
        case 'PURCHASE':
        case 'SUPPLIER_INVOICE':
            return 'isPurchaseApplicable' as const
        case 'SERVICE':
            return 'isServiceApplicable' as const
        case 'INVENTORY':
            return 'isInventoryApplicable' as const
        case 'INVENTORY_PURCHASE':
            return 'isInventoryApplicable' as const
        default:
            return null
    }
}

@Injectable()
export class FicoTaxCodeService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly calculation: FicoTaxCalculationService,
    ) {}

    // ---------------------------------------------------------------------
    // Queries
    // ---------------------------------------------------------------------

    async list(query: TaxCodeListQuery, user: AuthRequestUser) {
        const companyId = query.companyId ?? ''
        await this.access.assertAccess(user, companyId)

        const page = Math.max(1, query.page ?? 1)
        const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50))
        const today = todayUtc()
        const effectiveDate = query.effectiveDate
            ? toDateOnly(query.effectiveDate)
            : null
        const statusFilter = this.statusWhere(query.status, today)
        const rateFilters: Prisma.FicoTaxCodeWhereInput[] = []
        if (statusFilter) rateFilters.push(statusFilter)
        if (effectiveDate) {
            rateFilters.push({
                taxRates: { some: currentRateFilter(effectiveDate) },
            })
        }

        const where: Prisma.FicoTaxCodeWhereInput = {
            companyId,
            ...(query.taxCategory ? { taxCategory: query.taxCategory } : {}),
            ...(query.taxType ? { taxType: query.taxType } : {}),
            ...(query.taxJurisdiction
                ? { taxJurisdiction: query.taxJurisdiction }
                : {}),
            ...(query.countryCode ? { countryCode: query.countryCode } : {}),
            ...(query.calculationMethod
                ? { calculationMethod: query.calculationMethod }
                : {}),
            ...(query.transactionType
                ? this.transactionTypeWhere(query.transactionType)
                : {}),
            ...(rateFilters.length ? { AND: rateFilters } : {}),
            ...(query.search
                ? {
                      OR: [
                          {
                              code: {
                                  contains: query.search,
                                  mode: 'insensitive' as const,
                              },
                          },
                          {
                              name: {
                                  contains: query.search,
                                  mode: 'insensitive' as const,
                              },
                          },
                          {
                              taxJurisdiction: {
                                  contains: query.search,
                                  mode: 'insensitive' as const,
                              },
                          },
                      ],
                  }
                : {}),
        }

        const [items, total] = await Promise.all([
            this.prisma.ficoTaxCode.findMany({
                where,
                include: TAX_CODE_INCLUDE,
                orderBy: [{ code: 'asc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.ficoTaxCode.count({ where }),
        ])

        return {
            items: items.map((item) => this.serializeTaxCode(item, today)),
            total,
            page,
            pageSize,
        }
    }

    async summary(companyId: string, user: AuthRequestUser) {
        await this.access.assertAccess(user, companyId)
        const today = todayUtc()

        const base: Prisma.FicoTaxCodeWhereInput = { companyId }
        const activeWhere = this.statusWhere('ACTIVE', today) as Prisma.FicoTaxCodeWhereInput
        const scheduledWhere = this.statusWhere('SCHEDULED', today) as Prisma.FicoTaxCodeWhereInput
        const expiredWhere = this.statusWhere('EXPIRED', today) as Prisma.FicoTaxCodeWhereInput

        const [
            total,
            active,
            inactive,
            draft,
            expired,
            scheduled,
            upcomingRateChanges,
        ] = await Promise.all([
            this.prisma.ficoTaxCode.count({ where: base }),
            this.prisma.ficoTaxCode.count({ where: { ...base, ...activeWhere } }),
            this.prisma.ficoTaxCode.count({
                where: { ...base, status: 'INACTIVE' },
            }),
            this.prisma.ficoTaxCode.count({
                where: { ...base, status: 'DRAFT' },
            }),
            this.prisma.ficoTaxCode.count({ where: { ...base, ...expiredWhere } }),
            this.prisma.ficoTaxCode.count({
                where: { ...base, ...scheduledWhere },
            }),
            this.prisma.ficoTaxCode.count({
                where: {
                    ...base,
                    taxRates: { some: futureRateFilter(today) },
                },
            }),
        ])

        return {
            total,
            active,
            inactive,
            draft,
            expired,
            scheduled,
            upcomingRateChanges,
            generatedAt: new Date().toISOString(),
        }
    }

    async get(id: string, user: AuthRequestUser) {
        const taxCode = await this.prisma.ficoTaxCode.findUnique({
            where: { id },
            include: TAX_CODE_INCLUDE,
        })
        if (!taxCode) {
            throw new NotFoundException('Tax code not found.')
        }
        await this.access.assertAccess(user, taxCode.companyId ?? '')
        return this.serializeTaxCode(taxCode, todayUtc())
    }

    // ---------------------------------------------------------------------
    // Tax code lifecycle
    // ---------------------------------------------------------------------

    async create(input: TaxCodeCreateInput, user: AuthRequestUser) {
        const companyId = input.companyId ?? ''
        await this.access.assertAccess(user, companyId)

        const code = normalizeCode(input.code)
        const status = input.status ?? 'DRAFT'
        if (!isFicoTaxCodeStatus(status)) {
            throw new BadRequestException(`Invalid tax code status: ${status}`)
        }
        if (status === 'INACTIVE') {
            throw new BadRequestException(
                'A new tax code cannot be created as inactive.',
            )
        }

        this.assertConfigurationValues({
            taxCategory: input.taxCategory,
            taxType: input.taxType,
            calculationMethod: input.calculationMethod,
            rateUnit: input.rateUnit,
            roundingMethod: input.roundingMethod,
            roundingLevel: input.roundingLevel,
            decimalPrecision: input.decimalPrecision,
        })

        const existing = await this.prisma.ficoTaxCode.findUnique({
            where: { companyId_code: { companyId, code } },
        })
        if (existing) {
            throw new ConflictException(
                `Tax code "${code}" already exists for this company.`,
            )
        }

        const defaults = applicabilityDefaults(input.taxCategory)
        const applicability = {
            isSalesApplicable: input.isSalesApplicable ?? defaults.sales,
            isPurchaseApplicable: input.isPurchaseApplicable ?? defaults.purchase,
            isServiceApplicable: input.isServiceApplicable ?? defaults.service,
            isInventoryApplicable:
                input.isInventoryApplicable ?? defaults.inventory,
        }
        const isRecoverable = input.isRecoverable ?? true

        this.assertCompatibility({
            taxCategory: input.taxCategory,
            taxType: input.taxType,
            ...applicability,
        })

        await this.validateGlMappings(companyId, {
            inputTaxGlAccountId: input.inputTaxGlAccountId,
            outputTaxGlAccountId: input.outputTaxGlAccountId,
            withholdingPayableGlAccountId:
                input.withholdingPayableGlAccountId,
            withholdingReceivableGlAccountId:
                input.withholdingReceivableGlAccountId,
            nonRecoverableTaxGlAccountId:
                input.nonRecoverableTaxGlAccountId,
        })

        const initialRate =
            input.initialRate !== undefined && input.initialRate !== null
                ? new Decimal(String(input.initialRate))
                : null
        const rateUnit = input.initialRateUnit ?? input.rateUnit ?? 'PERCENTAGE'
        if (!isFicoTaxRateUnit(rateUnit)) {
            throw new BadRequestException(`Invalid rate unit: ${rateUnit}`)
        }
        const effectiveFrom = input.effectiveFrom
            ? toDateOnly(input.effectiveFrom)
            : todayUtc()
        const effectiveTo = input.effectiveTo
            ? toDateOnly(input.effectiveTo)
            : null

        if (initialRate !== null) {
            this.assertRateValue({
                rate: initialRate,
                rateUnit,
                taxType: input.taxType,
                effectiveFrom,
                effectiveTo,
            })
        }

        const created = await this.prisma.$transaction(async (tx) => {
            const taxCode = await tx.ficoTaxCode.create({
                data: {
                    companyId,
                    code,
                    name: input.name.trim(),
                    description: input.description?.trim() || null,
                    taxCategory: input.taxCategory,
                    taxType: input.taxType,
                    taxJurisdiction: input.taxJurisdiction?.trim() || null,
                    countryCode: normalizeCountryCode(input.countryCode),
                    calculationMethod:
                        input.calculationMethod ?? 'TAX_EXCLUSIVE',
                    rateUnit,
                    roundingMethod: input.roundingMethod ?? 'HALF_UP',
                    decimalPrecision: input.decimalPrecision ?? 2,
                    roundingLevel: input.roundingLevel ?? 'PER_LINE_ITEM',
                    calculationPriority: input.calculationPriority ?? 0,
                    ...applicability,
                    isRecoverable,
                    inputTaxGlAccountId: input.inputTaxGlAccountId ?? null,
                    outputTaxGlAccountId: input.outputTaxGlAccountId ?? null,
                    withholdingPayableGlAccountId:
                        input.withholdingPayableGlAccountId ?? null,
                    withholdingReceivableGlAccountId:
                        input.withholdingReceivableGlAccountId ?? null,
                    nonRecoverableTaxGlAccountId:
                        input.nonRecoverableTaxGlAccountId ?? null,
                    status: 'DRAFT',
                    remarks: input.remarks?.trim() || null,
                    createdBy: user.id,
                },
                include: TAX_CODE_INCLUDE,
            })

            if (initialRate !== null) {
                const rate = await tx.ficoTaxRate.create({
                    data: {
                        taxCodeId: taxCode.id,
                        companyId,
                        rate: initialRate,
                        rateUnit,
                        effectiveFrom,
                        effectiveTo,
                        description: input.rateDescription?.trim() || null,
                        status: rateStatusForDates(effectiveFrom, effectiveTo),
                        createdBy: user.id,
                    },
                })
                await this.writeAudit(tx, {
                    taxCodeId: taxCode.id,
                    companyId,
                    actorId: user.id,
                    action: FICO_TAX_AUDIT_ACTIONS.TAX_CODE_RATE_CREATE,
                    entityType: 'FicoTaxRate',
                    entityId: rate.id,
                    previousValues: null,
                    newValues: this.rateAuditValues(rate),
                })
            }

            let result = taxCode
            if (status === 'ACTIVE') {
                const reloaded = await tx.ficoTaxCode.findUniqueOrThrow({
                    where: { id: taxCode.id },
                    include: TAX_CODE_INCLUDE,
                })
                await this.assertActivatable(reloaded, tx)
                result = await tx.ficoTaxCode.update({
                    where: { id: taxCode.id },
                    data: { status: 'ACTIVE', updatedBy: user.id },
                    include: TAX_CODE_INCLUDE,
                })
            }

            await this.writeAudit(tx, {
                taxCodeId: taxCode.id,
                companyId,
                actorId: user.id,
                action: FICO_TAX_AUDIT_ACTIONS.TAX_CODE_CREATE,
                entityType: 'FicoTaxCode',
                entityId: taxCode.id,
                previousValues: null,
                newValues: this.taxCodeAuditValues(result),
            })

            if (status === 'ACTIVE') {
                await this.writeAudit(tx, {
                    taxCodeId: taxCode.id,
                    companyId,
                    actorId: user.id,
                    action: FICO_TAX_AUDIT_ACTIONS.TAX_CODE_ACTIVATE,
                    entityType: 'FicoTaxCode',
                    entityId: taxCode.id,
                    previousValues: { status: 'DRAFT' },
                    newValues: { status: 'ACTIVE' },
                })
            }

            return result
        })

        return this.serializeTaxCode(created, todayUtc())
    }

    async update(id: string, input: TaxCodeUpdateInput, user: AuthRequestUser) {
        const existing = await this.prisma.ficoTaxCode.findUnique({
            where: { id },
            include: TAX_CODE_INCLUDE,
        })
        if (!existing) {
            throw new NotFoundException('Tax code not found.')
        }
        const companyId = existing.companyId ?? ''
        await this.access.assertAccess(user, companyId)

        this.assertConfigurationValues({
            taxCategory: existing.taxCategory,
            taxType: existing.taxType,
            calculationMethod: input.calculationMethod,
            rateUnit: input.rateUnit,
            roundingMethod: input.roundingMethod,
            roundingLevel: input.roundingLevel,
            decimalPrecision: input.decimalPrecision,
        })

        const nextStatus = input.status ?? existing.status
        if (!isFicoTaxCodeStatus(nextStatus)) {
            throw new BadRequestException(
                `Invalid tax code status: ${nextStatus}`,
            )
        }
        this.assertStatusTransition(existing.status, nextStatus)

        const rateCount = existing.taxRates.length
        const structuralFields = [
            'taxCategory',
            'taxType',
            'calculationMethod',
            'rateUnit',
        ] as const
        const changesStructure = structuralFields.some(
            (field) =>
                input[field as keyof TaxCodeUpdateInput] !== undefined &&
                input[field as keyof TaxCodeUpdateInput] !== existing[field],
        )
        if (
            changesStructure &&
            (rateCount > 0 || existing.status === 'ACTIVE')
        ) {
            throw new BadRequestException(
                'Tax category, tax type, calculation method and rate unit cannot be changed once rates exist or the tax code is active. Duplicate the configuration instead.',
            )
        }

        const applicability = {
            isSalesApplicable:
                input.isSalesApplicable ?? existing.isSalesApplicable,
            isPurchaseApplicable:
                input.isPurchaseApplicable ?? existing.isPurchaseApplicable,
            isServiceApplicable:
                input.isServiceApplicable ?? existing.isServiceApplicable,
            isInventoryApplicable:
                input.isInventoryApplicable ?? existing.isInventoryApplicable,
        }
        this.assertCompatibility({
            taxCategory: existing.taxCategory,
            taxType: existing.taxType,
            ...applicability,
        })

        const mappings = {
            inputTaxGlAccountId:
                input.inputTaxGlAccountId !== undefined
                    ? input.inputTaxGlAccountId
                    : existing.inputTaxGlAccountId,
            outputTaxGlAccountId:
                input.outputTaxGlAccountId !== undefined
                    ? input.outputTaxGlAccountId
                    : existing.outputTaxGlAccountId,
            withholdingPayableGlAccountId:
                input.withholdingPayableGlAccountId !== undefined
                    ? input.withholdingPayableGlAccountId
                    : existing.withholdingPayableGlAccountId,
            withholdingReceivableGlAccountId:
                input.withholdingReceivableGlAccountId !== undefined
                    ? input.withholdingReceivableGlAccountId
                    : existing.withholdingReceivableGlAccountId,
            nonRecoverableTaxGlAccountId:
                input.nonRecoverableTaxGlAccountId !== undefined
                    ? input.nonRecoverableTaxGlAccountId
                    : existing.nonRecoverableTaxGlAccountId,
        }

        const mappingTouched = GL_MAPPING_FIELDS.some(
            (field) => input[field.key] !== undefined,
        )
        if (mappingTouched) {
            await this.validateGlMappings(companyId, mappings)
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            const taxCode = await tx.ficoTaxCode.update({
                where: { id },
                data: {
                    name: input.name?.trim() ?? existing.name,
                    description:
                        input.description !== undefined
                            ? input.description?.trim() || null
                            : existing.description,
                    taxJurisdiction:
                        input.taxJurisdiction !== undefined
                            ? input.taxJurisdiction?.trim() || null
                            : existing.taxJurisdiction,
                    countryCode:
                        input.countryCode !== undefined
                            ? normalizeCountryCode(input.countryCode)
                            : existing.countryCode,
                    calculationMethod:
                        input.calculationMethod ?? existing.calculationMethod,
                    rateUnit: input.rateUnit ?? existing.rateUnit,
                    roundingMethod:
                        input.roundingMethod ?? existing.roundingMethod,
                    decimalPrecision:
                        input.decimalPrecision ?? existing.decimalPrecision,
                    roundingLevel:
                        input.roundingLevel ?? existing.roundingLevel,
                    calculationPriority:
                        input.calculationPriority ??
                        existing.calculationPriority,
                    ...applicability,
                    isRecoverable:
                        input.isRecoverable ?? existing.isRecoverable,
                    ...mappings,
                    status: nextStatus,
                    remarks:
                        input.remarks !== undefined
                            ? input.remarks?.trim() || null
                            : existing.remarks,
                    updatedBy: user.id,
                },
                include: TAX_CODE_INCLUDE,
            })

            if (nextStatus === 'ACTIVE' && existing.status !== 'ACTIVE') {
                await this.assertActivatable(taxCode, tx)
            }

            await this.writeAudit(tx, {
                taxCodeId: taxCode.id,
                companyId,
                actorId: user.id,
                action: FICO_TAX_AUDIT_ACTIONS.TAX_CODE_UPDATE,
                entityType: 'FicoTaxCode',
                entityId: taxCode.id,
                previousValues: this.taxCodeAuditValues(existing),
                newValues: this.taxCodeAuditValues(taxCode),
            })

            if (nextStatus !== existing.status) {
                const action =
                    nextStatus === 'ACTIVE'
                        ? FICO_TAX_AUDIT_ACTIONS.TAX_CODE_ACTIVATE
                        : FICO_TAX_AUDIT_ACTIONS.TAX_CODE_DEACTIVATE
                await this.writeAudit(tx, {
                    taxCodeId: taxCode.id,
                    companyId,
                    actorId: user.id,
                    action,
                    entityType: 'FicoTaxCode',
                    entityId: taxCode.id,
                    previousValues: { status: existing.status },
                    newValues: { status: nextStatus },
                })
            }

            return taxCode
        })

        return this.serializeTaxCode(updated, todayUtc())
    }

    async activate(input: TaxCodeActivateInput, user: AuthRequestUser) {
        const taxCode = await this.prisma.ficoTaxCode.findUnique({
            where: { id: input.taxCodeId },
            include: TAX_CODE_INCLUDE,
        })
        if (!taxCode) {
            throw new NotFoundException('Tax code not found.')
        }
        await this.access.assertAccess(user, taxCode.companyId ?? '')
        if (taxCode.status === 'ACTIVE') {
            throw new ConflictException('Tax code is already active.')
        }
        this.assertStatusTransition(taxCode.status, 'ACTIVE')

        const updated = await this.prisma.$transaction(async (tx) => {
            await this.assertActivatable(taxCode, tx)
            const result = await tx.ficoTaxCode.update({
                where: { id: taxCode.id },
                data: { status: 'ACTIVE', updatedBy: user.id },
                include: TAX_CODE_INCLUDE,
            })
            await this.writeAudit(tx, {
                taxCodeId: result.id,
                companyId: result.companyId ?? '',
                actorId: user.id,
                action: FICO_TAX_AUDIT_ACTIONS.TAX_CODE_ACTIVATE,
                entityType: 'FicoTaxCode',
                entityId: result.id,
                previousValues: { status: taxCode.status },
                newValues: { status: 'ACTIVE' },
                reason: input.reason ?? null,
            })
            return result
        })

        return this.serializeTaxCode(updated, todayUtc())
    }

    async deactivate(input: TaxCodeDeactivateInput, user: AuthRequestUser) {
        const taxCode = await this.prisma.ficoTaxCode.findUnique({
            where: { id: input.taxCodeId },
        })
        if (!taxCode) {
            throw new NotFoundException('Tax code not found.')
        }
        await this.access.assertAccess(user, taxCode.companyId ?? '')
        if (taxCode.status === 'INACTIVE') {
            throw new ConflictException('Tax code is already inactive.')
        }
        this.assertStatusTransition(taxCode.status, 'INACTIVE')

        const updated = await this.prisma.$transaction(async (tx) => {
            const result = await tx.ficoTaxCode.update({
                where: { id: taxCode.id },
                data: { status: 'INACTIVE', updatedBy: user.id },
                include: TAX_CODE_INCLUDE,
            })
            await this.writeAudit(tx, {
                taxCodeId: result.id,
                companyId: result.companyId ?? '',
                actorId: user.id,
                action: FICO_TAX_AUDIT_ACTIONS.TAX_CODE_DEACTIVATE,
                entityType: 'FicoTaxCode',
                entityId: result.id,
                previousValues: { status: taxCode.status },
                newValues: { status: 'INACTIVE' },
                reason: input.reason ?? null,
            })
            return result
        })

        return this.serializeTaxCode(updated, todayUtc())
    }

    async remove(id: string, user: AuthRequestUser) {
        const taxCode = await this.prisma.ficoTaxCode.findUnique({
            where: { id },
        })
        if (!taxCode) {
            throw new NotFoundException('Tax code not found.')
        }
        await this.access.assertAccess(user, taxCode.companyId ?? '')
        throw new BadRequestException(
            'Tax codes are retained for audit and historical rate preservation. Deactivate the tax code instead of deleting it.',
        )
    }

    // ---------------------------------------------------------------------
    // Effective-dated rates
    // ---------------------------------------------------------------------

    async getRates(query: TaxRateQuery, user: AuthRequestUser) {
        const taxCode = await this.prisma.ficoTaxCode.findUnique({
            where: { id: query.taxCodeId },
            select: { id: true, companyId: true, code: true, name: true },
        })
        if (!taxCode) {
            throw new NotFoundException('Tax code not found.')
        }
        await this.access.assertAccess(user, taxCode.companyId ?? '')

        const page = Math.max(1, query.page ?? 1)
        const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50))
        const today = todayUtc()

        const where: Prisma.FicoTaxRateWhereInput = {
            taxCodeId: query.taxCodeId,
            ...(query.status ? rateStatusWhere(query.status, today) : {}),
            ...(query.effectiveFrom
                ? { effectiveFrom: { gte: toDateOnly(query.effectiveFrom) } }
                : {}),
            ...(query.effectiveTo
                ? { effectiveTo: { lte: toDateOnly(query.effectiveTo) } }
                : {}),
        }

        const [items, total] = await Promise.all([
            this.prisma.ficoTaxRate.findMany({
                where,
                orderBy: [{ effectiveFrom: 'desc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.ficoTaxRate.count({ where }),
        ])

        return {
            items: items.map((rate) => this.serializeRate(rate, today)),
            total,
            page,
            pageSize,
            taxCode: {
                id: taxCode.id,
                code: taxCode.code,
                name: taxCode.name,
            },
        }
    }

    async createRate(
        taxCodeId: string,
        dto: TaxRateCreateInput,
        user: AuthRequestUser,
    ) {
        const taxCode = await this.prisma.ficoTaxCode.findUnique({
            where: { id: taxCodeId },
            include: TAX_CODE_INCLUDE,
        })
        if (!taxCode) {
            throw new NotFoundException('Tax code not found.')
        }
        await this.access.assertAccess(user, taxCode.companyId ?? '')

        const effectiveFrom = toDateOnly(dto.effectiveFrom)
        const effectiveTo = dto.effectiveTo
            ? toDateOnly(dto.effectiveTo)
            : null
        const rateUnit = dto.rateUnit ?? taxCode.rateUnit
        if (!isFicoTaxRateUnit(rateUnit)) {
            throw new BadRequestException(`Invalid rate unit: ${rateUnit}`)
        }
        const rate = new Decimal(String(dto.rate))
        this.assertRateValue({
            rate,
            rateUnit,
            taxType: taxCode.taxType,
            effectiveFrom,
            effectiveTo,
        })

        const created = await this.prisma.$transaction(
            async (tx) => {
                const today = todayUtc()
                const openEnded = await tx.ficoTaxRate.findFirst({
                    where: {
                        taxCodeId,
                        status: { not: 'INACTIVE' },
                        effectiveTo: null,
                        effectiveFrom: { lt: effectiveFrom },
                    },
                    orderBy: { effectiveFrom: 'desc' },
                })
                if (openEnded) {
                    const closedOn = addDays(effectiveFrom, -1)
                    if (closedOn >= toDateOnly(openEnded.effectiveFrom)) {
                        const closed = await tx.ficoTaxRate.update({
                            where: { id: openEnded.id },
                            data: {
                                effectiveTo: closedOn,
                                status: rateStatusForDates(
                                    toDateOnly(openEnded.effectiveFrom),
                                    closedOn,
                                    today,
                                ),
                            },
                        })
                        await this.writeAudit(tx, {
                            taxCodeId,
                            companyId: taxCode.companyId ?? '',
                            actorId: user.id,
                            action: FICO_TAX_AUDIT_ACTIONS.TAX_CODE_RATE_UPDATE,
                            entityType: 'FicoTaxRate',
                            entityId: closed.id,
                            previousValues: this.rateAuditValues(openEnded),
                            newValues: this.rateAuditValues(closed),
                            reason: 'Automatically closed by a new effective-dated rate.',
                        })
                    }
                }

                const conflict = await tx.ficoTaxRate.findFirst({
                    where: {
                        taxCodeId,
                        status: { not: 'INACTIVE' },
                        effectiveFrom: { lte: effectiveTo ?? MAX_DATE },
                        OR: [
                            { effectiveTo: null },
                            { effectiveTo: { gte: effectiveFrom } },
                        ],
                    },
                })
                if (conflict) {
                    throw new BadRequestException(
                        'Effective date period overlaps with an existing rate. Close the existing rate before adding a new one.',
                    )
                }

                const rateRow = await tx.ficoTaxRate.create({
                    data: {
                        taxCodeId,
                        companyId: taxCode.companyId ?? '',
                        rate,
                        rateUnit,
                        effectiveFrom,
                        effectiveTo,
                        description: dto.description?.trim() || null,
                        status: rateStatusForDates(
                            effectiveFrom,
                            effectiveTo,
                            today,
                        ),
                        createdBy: user.id,
                    },
                })

                await this.writeAudit(tx, {
                    taxCodeId,
                    companyId: taxCode.companyId ?? '',
                    actorId: user.id,
                    action: FICO_TAX_AUDIT_ACTIONS.TAX_CODE_RATE_CREATE,
                    entityType: 'FicoTaxRate',
                    entityId: rateRow.id,
                    previousValues: null,
                    newValues: this.rateAuditValues(rateRow),
                })

                return rateRow
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        )

        return this.serializeRate(created, todayUtc())
    }

    async updateRate(
        taxCodeId: string,
        rateId: string,
        dto: TaxRateUpdateInput,
        user: AuthRequestUser,
    ) {
        const rate = await this.prisma.ficoTaxRate.findUnique({
            where: { id: rateId },
            include: { taxCode: true },
        })
        if (!rate) {
            throw new NotFoundException('Tax rate not found.')
        }
        if (rate.taxCodeId !== taxCodeId) {
            throw new BadRequestException(
                'Tax rate does not belong to this tax code.',
            )
        }
        await this.access.assertAccess(user, rate.taxCode.companyId ?? '')

        const today = todayUtc()
        const started = toDateOnly(rate.effectiveFrom) <= today
        const nextFrom =
            dto.effectiveFrom !== undefined
                ? dto.effectiveFrom
                    ? toDateOnly(dto.effectiveFrom)
                    : toDateOnly(rate.effectiveFrom)
                : toDateOnly(rate.effectiveFrom)
        const nextTo =
            dto.effectiveTo !== undefined
                ? dto.effectiveTo
                    ? toDateOnly(dto.effectiveTo)
                    : null
                : rate.effectiveTo
                  ? toDateOnly(rate.effectiveTo)
                  : null
        const nextUnit = dto.rateUnit ?? rate.rateUnit
        if (!isFicoTaxRateUnit(nextUnit)) {
            throw new BadRequestException(`Invalid rate unit: ${nextUnit}`)
        }
        const nextRate =
            dto.rate !== undefined ? new Decimal(String(dto.rate)) : rate.rate

        if (started) {
            if (nextFrom.getTime() !== toDateOnly(rate.effectiveFrom).getTime()) {
                throw new BadRequestException(
                    'The effective-from date of a rate that has already started cannot be changed. Create a new effective-dated rate instead.',
                )
            }
            if (!nextRate.eq(rate.rate)) {
                throw new BadRequestException(
                    'The rate amount of a rate that has already started cannot be changed. Create a new effective-dated rate instead.',
                )
            }
            if (nextUnit !== rate.rateUnit) {
                throw new BadRequestException(
                    'The rate unit of a rate that has already started cannot be changed. Create a new effective-dated rate instead.',
                )
            }
        }

        this.assertRateValue({
            rate: nextRate,
            rateUnit: nextUnit,
            taxType: rate.taxCode.taxType,
            effectiveFrom: nextFrom,
            effectiveTo: nextTo,
        })

        const nextStatus =
            dto.status === 'INACTIVE'
                ? 'INACTIVE'
                : dto.status === 'ACTIVE' || dto.status === undefined
                  ? rateStatusForDates(nextFrom, nextTo, today)
                  : dto.status

        const updated = await this.prisma.$transaction(
            async (tx) => {
                if (nextStatus !== 'INACTIVE') {
                    const conflict = await tx.ficoTaxRate.findFirst({
                        where: {
                            taxCodeId,
                            id: { not: rateId },
                            status: { not: 'INACTIVE' },
                            effectiveFrom: { lte: nextTo ?? MAX_DATE },
                            OR: [
                                { effectiveTo: null },
                                { effectiveTo: { gte: nextFrom } },
                            ],
                        },
                    })
                    if (conflict) {
                        throw new BadRequestException(
                            'Effective date period overlaps with an existing rate.',
                        )
                    }
                }

                const row = await tx.ficoTaxRate.update({
                    where: { id: rateId },
                    data: {
                        rate: nextRate,
                        rateUnit: nextUnit,
                        effectiveFrom: nextFrom,
                        effectiveTo: nextTo,
                        description:
                            dto.description !== undefined
                                ? dto.description?.trim() || null
                                : rate.description,
                        status: nextStatus,
                    },
                })

                await this.writeAudit(tx, {
                    taxCodeId,
                    companyId: rate.taxCode.companyId ?? '',
                    actorId: user.id,
                    action:
                        nextStatus === 'INACTIVE' &&
                        rate.status !== 'INACTIVE'
                            ? FICO_TAX_AUDIT_ACTIONS.TAX_CODE_RATE_DEACTIVATE
                            : FICO_TAX_AUDIT_ACTIONS.TAX_CODE_RATE_UPDATE,
                    entityType: 'FicoTaxRate',
                    entityId: row.id,
                    previousValues: this.rateAuditValues(rate),
                    newValues: this.rateAuditValues(row),
                })

                return row
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        )

        return this.serializeRate(updated, todayUtc())
    }

    // ---------------------------------------------------------------------
    // Audit history and duplication
    // ---------------------------------------------------------------------

    async history(
        taxCodeId: string,
        query: FicoTaxCodeHistoryQueryDto,
        user: AuthRequestUser,
    ) {
        const taxCode = await this.prisma.ficoTaxCode.findUnique({
            where: { id: taxCodeId },
            select: { id: true, code: true, name: true, companyId: true },
        })
        if (!taxCode) {
            throw new NotFoundException('Tax code not found.')
        }
        await this.access.assertAccess(user, taxCode.companyId ?? '')

        const page = Math.max(1, query.page ?? 1)
        const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50))
        const where: Prisma.FicoTaxCodeAuditLogWhereInput = {
            taxCodeId,
            ...(query.action ? { action: query.action } : {}),
            ...(query.actorId ? { actorId: query.actorId } : {}),
            ...(query.search
                ? {
                      OR: [
                          {
                              action: {
                                  contains: query.search,
                                  mode: 'insensitive' as const,
                              },
                          },
                          {
                              reason: {
                                  contains: query.search,
                                  mode: 'insensitive' as const,
                              },
                          },
                          {
                              entityType: {
                                  contains: query.search,
                                  mode: 'insensitive' as const,
                              },
                          },
                      ],
                  }
                : {}),
            ...(query.dateFrom || query.dateTo
                ? {
                      createdAt: {
                          ...(query.dateFrom
                              ? { gte: toDateOnly(query.dateFrom) }
                              : {}),
                          ...(query.dateTo
                              ? { lt: addDays(toDateOnly(query.dateTo), 1) }
                              : {}),
                      },
                  }
                : {}),
        }

        const [items, total, actorRows] = await Promise.all([
            this.prisma.ficoTaxCodeAuditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.ficoTaxCodeAuditLog.count({ where }),
            this.prisma.ficoTaxCodeAuditLog.findMany({
                where: { taxCodeId },
                distinct: ['actorId'],
                select: { actorId: true },
            }),
        ])

        const actorIds = [
            ...new Set(actorRows.map((item) => item.actorId).filter(Boolean)),
        ] as string[]
        const actors = actorIds.length
            ? await this.prisma.user.findMany({
                  where: { id: { in: actorIds } },
                  select: {
                      id: true,
                      email: true,
                      userName: true,
                      firstName: true,
                      lastName: true,
                  },
              })
            : []
        const actorMap = new Map(actors.map((actor) => [actor.id, actor]))
        const performerOf = (actorId: string | null) => {
            const actor = actorId ? actorMap.get(actorId) : null
            if (!actor) return null
            const name =
                [actor.firstName, actor.lastName]
                    .filter(Boolean)
                    .join(' ')
                    .trim() || actor.userName
            return {
                id: actor.id,
                name,
                email: actor.email,
                userName: actor.userName,
            }
        }

        return {
            items: items.map((item) => ({
                ...item,
                performer: performerOf(item.actorId),
            })),
            total,
            page,
            pageSize,
            taxCode,
            actions: Object.values(FICO_TAX_AUDIT_ACTIONS),
            actors: actors
                .map((actor) => performerOf(actor.id))
                .filter((actor): actor is NonNullable<typeof actor> => Boolean(actor))
                .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
        }
    }

    async duplicate(
        id: string,
        dto: FicoTaxCodeDuplicateDto,
        user: AuthRequestUser,
    ) {
        const source = await this.prisma.ficoTaxCode.findUnique({
            where: { id },
            include: TAX_CODE_INCLUDE,
        })
        if (!source) {
            throw new NotFoundException('Tax code not found.')
        }
        await this.access.assertAccess(user, source.companyId ?? '')

        const targetCompanyId = dto.companyId ?? source.companyId ?? ''
        if (targetCompanyId !== source.companyId) {
            await this.access.assertAccess(user, targetCompanyId)
        }
        const code = normalizeCode(dto.code)
        const existing = await this.prisma.ficoTaxCode.findUnique({
            where: { companyId_code: { companyId: targetCompanyId, code } },
        })
        if (existing) {
            throw new ConflictException(
                `Tax code "${code}" already exists for this company.`,
            )
        }

        const warnings: string[] = []
        const sameCompany = targetCompanyId === source.companyId
        if (!sameCompany) {
            warnings.push(
                'G/L account mappings were not copied because the target company may use a different chart of accounts.',
            )
        }

        const created = await this.prisma.$transaction(async (tx) => {
            const taxCode = await tx.ficoTaxCode.create({
                data: {
                    companyId: targetCompanyId,
                    code,
                    name: dto.name?.trim() || `${source.name} (copy)`,
                    description: source.description,
                    taxCategory: source.taxCategory,
                    taxType: source.taxType,
                    taxJurisdiction: source.taxJurisdiction,
                    countryCode: source.countryCode,
                    calculationMethod: source.calculationMethod,
                    rateUnit: source.rateUnit,
                    roundingMethod: source.roundingMethod,
                    decimalPrecision: source.decimalPrecision,
                    roundingLevel: source.roundingLevel,
                    calculationPriority: source.calculationPriority,
                    isSalesApplicable: source.isSalesApplicable,
                    isPurchaseApplicable: source.isPurchaseApplicable,
                    isServiceApplicable: source.isServiceApplicable,
                    isInventoryApplicable: source.isInventoryApplicable,
                    isRecoverable: source.isRecoverable,
                    inputTaxGlAccountId: sameCompany
                        ? source.inputTaxGlAccountId
                        : null,
                    outputTaxGlAccountId: sameCompany
                        ? source.outputTaxGlAccountId
                        : null,
                    withholdingPayableGlAccountId: sameCompany
                        ? source.withholdingPayableGlAccountId
                        : null,
                    withholdingReceivableGlAccountId: sameCompany
                        ? source.withholdingReceivableGlAccountId
                        : null,
                    nonRecoverableTaxGlAccountId: sameCompany
                        ? source.nonRecoverableTaxGlAccountId
                        : null,
                    status: 'DRAFT',
                    remarks: source.remarks,
                    createdBy: user.id,
                },
                include: TAX_CODE_INCLUDE,
            })

            if (dto.includeRates !== false && source.taxRates.length > 0) {
                for (const rate of source.taxRates) {
                    const row = await tx.ficoTaxRate.create({
                        data: {
                            taxCodeId: taxCode.id,
                            companyId: targetCompanyId,
                            rate: rate.rate,
                            rateUnit: rate.rateUnit,
                            effectiveFrom: rate.effectiveFrom,
                            effectiveTo: rate.effectiveTo,
                            description: rate.description,
                            status: rateStatusForDates(
                                toDateOnly(rate.effectiveFrom),
                                rate.effectiveTo
                                    ? toDateOnly(rate.effectiveTo)
                                    : null,
                            ),
                            createdBy: user.id,
                        },
                    })
                    await this.writeAudit(tx, {
                        taxCodeId: taxCode.id,
                        companyId: targetCompanyId,
                        actorId: user.id,
                        action:
                            FICO_TAX_AUDIT_ACTIONS.TAX_CODE_RATE_CREATE,
                        entityType: 'FicoTaxRate',
                        entityId: row.id,
                        previousValues: null,
                        newValues: this.rateAuditValues(row),
                        reason: `Copied from tax code ${source.code}.`,
                    })
                }
            }

            await this.writeAudit(tx, {
                taxCodeId: taxCode.id,
                companyId: targetCompanyId,
                actorId: user.id,
                action: FICO_TAX_AUDIT_ACTIONS.TAX_CODE_DUPLICATE,
                entityType: 'FicoTaxCode',
                entityId: taxCode.id,
                previousValues: {
                    sourceTaxCodeId: source.id,
                    sourceCode: source.code,
                },
                newValues: {
                    ...this.taxCodeAuditValues(taxCode),
                    includeRates: dto.includeRates !== false,
                },
                metadata: { sourceTaxCodeId: source.id },
            })

            return taxCode
        })

        return {
            taxCode: this.serializeTaxCode(created, todayUtc()),
            warnings,
        }
    }

    // ---------------------------------------------------------------------
    // Calculation preview
    // ---------------------------------------------------------------------

    async calculate(
        input: FicoTaxCalculationDto,
        user: AuthRequestUser,
    ): Promise<FicoTaxCalculationResult> {
        const taxCode = await this.prisma.ficoTaxCode.findUnique({
            where: { id: input.taxCodeId },
            include: TAX_CODE_INCLUDE,
        })
        if (!taxCode) {
            throw new NotFoundException('Tax code not found.')
        }
        await this.access.assertAccess(user, input.companyId ?? '')
        if (taxCode.companyId !== input.companyId) {
            throw new BadRequestException(
                'Tax code does not belong to the selected company.',
            )
        }
        if (taxCode.status !== 'ACTIVE') {
            throw new BadRequestException(
                'Only active tax codes can be used in new transactions.',
            )
        }

        const transactionDate = toDateOnly(input.transactionDate)
        const applicability = transactionApplicability(input.transactionType)
        if (applicability && !taxCode[applicability]) {
            throw new BadRequestException(
                `Tax code ${taxCode.code} is not applicable to ${input.transactionType.toLowerCase().replace(/_/g, ' ')} transactions.`,
            )
        }

        const zeroLike = (ZERO_LIKE_TAX_TYPES as readonly string[]).includes(
            taxCode.taxType,
        )
        const applicableRate =
            taxCode.taxRates
                .filter((rate) => rate.status !== 'INACTIVE')
                .filter(
                    (rate) =>
                        toDateOnly(rate.effectiveFrom) <= transactionDate &&
                        (!rate.effectiveTo ||
                            toDateOnly(rate.effectiveTo) >= transactionDate),
                )
                .sort(
                    (a, b) =>
                        toDateOnly(b.effectiveFrom).getTime() -
                        toDateOnly(a.effectiveFrom).getTime(),
                )[0] ?? null

        if (!applicableRate && !zeroLike) {
            throw new BadRequestException(
                'No applicable tax rate was found for the transaction date. Add an effective-dated rate before using this tax code.',
            )
        }

        const result = this.calculation.calculate({
            taxCodeId: taxCode.id,
            taxCode: taxCode.code,
            companyId: taxCode.companyId ?? '',
            taxType: taxCode.taxType,
            calculationMethod: taxCode.calculationMethod,
            roundingMethod: taxCode.roundingMethod,
            roundingLevel: taxCode.roundingLevel,
            decimalPrecision: taxCode.decimalPrecision,
            isRecoverable: taxCode.isRecoverable,
            rate: applicableRate
                ? {
                      rate: applicableRate.rate,
                      rateUnit: applicableRate.rateUnit,
                  }
                : {
                      rate: new Decimal(0),
                      rateUnit: taxCode.rateUnit,
                  },
            amount: input.amount,
            transactionDate: dateOnlyString(transactionDate) ?? input.transactionDate,
            transactionType: input.transactionType,
        })

        return {
            ...result,
            appliedRateId: applicableRate?.id ?? null,
            appliedRateEffectiveFrom: applicableRate
                ? dateOnlyString(applicableRate.effectiveFrom)
                : null,
            appliedRateEffectiveTo: applicableRate?.effectiveTo
                ? dateOnlyString(applicableRate.effectiveTo)
                : null,
        }
    }

    async utilization(id: string, user: AuthRequestUser) {
        const taxCode = await this.prisma.ficoTaxCode.findUnique({
            where: { id },
        })
        if (!taxCode) {
            throw new NotFoundException('Tax code not found.')
        }
        await this.access.assertAccess(user, taxCode.companyId ?? '')

        const [rateCount, auditLogCount] = await Promise.all([
            this.prisma.ficoTaxRate.count({ where: { taxCodeId: id } }),
            this.prisma.ficoTaxCodeAuditLog.count({
                where: { taxCodeId: id },
            }),
        ])

        return {
            taxCodeId: taxCode.id,
            taxCode: taxCode.code,
            taxCodeName: taxCode.name,
            rateCount,
            auditLogCount,
            isActive: taxCode.status === 'ACTIVE',
            status: taxCode.status,
            canDelete: false,
        }
    }

    // ---------------------------------------------------------------------
    // Serialization helpers
    // ---------------------------------------------------------------------

    private serializeTaxCode(taxCode: TaxCodeRecord, today: Date) {
        const rates = taxCode.taxRates.map((rate) =>
            this.serializeRate(rate, today),
        )
        const currentRate =
            rates.find((rate) => rate.effectiveStatus === 'ACTIVE') ?? null
        const nextRate =
            [...rates]
                .filter((rate) => rate.effectiveStatus === 'SCHEDULED')
                .sort(
                    (a, b) =>
                        new Date(a.effectiveFrom).getTime() -
                        new Date(b.effectiveFrom).getTime(),
                )[0] ?? null
        const latestRate = rates[0] ?? null
        const displayRate = currentRate ?? nextRate ?? latestRate

        return {
            ...taxCode,
            taxRates: rates,
            rateCount: rates.length,
            effectiveStatus: taxCodeEffectiveStatus(taxCode, today),
            currentRate,
            nextRate,
            latestRate,
            effectiveFrom: displayRate?.effectiveFrom ?? null,
            effectiveTo: displayRate?.effectiveTo ?? null,
            effectiveRate: displayRate?.rate ?? null,
            effectiveRateUnit: displayRate?.rateUnit ?? taxCode.rateUnit,
        }
    }

    private serializeRate(rate: TaxRateRecord, today: Date) {
        return {
            ...rate,
            rate: rate.rate.toNumber(),
            effectiveStatus: rateEffectiveStatus(rate, today),
        }
    }

    private rateAuditValues(rate: TaxRateRecord) {
        return {
            rate: rate.rate.toString(),
            rateUnit: rate.rateUnit,
            effectiveFrom: dateOnlyString(rate.effectiveFrom),
            effectiveTo: dateOnlyString(rate.effectiveTo),
            status: rate.status,
        }
    }

    private taxCodeAuditValues(taxCode: TaxCodeRecord) {
        return {
            code: taxCode.code,
            name: taxCode.name,
            taxCategory: taxCode.taxCategory,
            taxType: taxCode.taxType,
            calculationMethod: taxCode.calculationMethod,
            rateUnit: taxCode.rateUnit,
            roundingMethod: taxCode.roundingMethod,
            decimalPrecision: taxCode.decimalPrecision,
            roundingLevel: taxCode.roundingLevel,
            calculationPriority: taxCode.calculationPriority,
            isSalesApplicable: taxCode.isSalesApplicable,
            isPurchaseApplicable: taxCode.isPurchaseApplicable,
            isServiceApplicable: taxCode.isServiceApplicable,
            isInventoryApplicable: taxCode.isInventoryApplicable,
            isRecoverable: taxCode.isRecoverable,
            inputTaxGlAccountId: taxCode.inputTaxGlAccountId,
            outputTaxGlAccountId: taxCode.outputTaxGlAccountId,
            withholdingPayableGlAccountId:
                taxCode.withholdingPayableGlAccountId,
            withholdingReceivableGlAccountId:
                taxCode.withholdingReceivableGlAccountId,
            nonRecoverableTaxGlAccountId:
                taxCode.nonRecoverableTaxGlAccountId,
            status: taxCode.status,
            remarks: taxCode.remarks,
        }
    }

    // ---------------------------------------------------------------------
    // Validation helpers
    // ---------------------------------------------------------------------

    private statusWhere(
        status: string | undefined,
        today: Date,
    ): Prisma.FicoTaxCodeWhereInput | null {
        if (!status) return null
        if (status === 'DRAFT' || status === 'INACTIVE') {
            return { status }
        }
        if (status === 'ACTIVE') {
            return {
                status: 'ACTIVE',
                OR: [
                    { taxRates: { some: currentRateFilter(today) } },
                    {
                        taxType: { in: [...ZERO_LIKE_TAX_TYPES] },
                        taxRates: { none: {} },
                    },
                ],
            }
        }
        if (status === 'SCHEDULED') {
            return {
                status: 'ACTIVE',
                taxRates: {
                    none: currentRateFilter(today),
                    some: futureRateFilter(today),
                },
            }
        }
        if (status === 'EXPIRED') {
            return {
                status: 'ACTIVE',
                taxRates: { some: {} },
                AND: [
                    { taxRates: { none: currentRateFilter(today) } },
                    { taxRates: { none: futureRateFilter(today) } },
                ],
            }
        }
        throw new BadRequestException(`Invalid tax code status filter: ${status}`)
    }

    private transactionTypeWhere(
        transactionType: string,
    ): Prisma.FicoTaxCodeWhereInput {
        switch (transactionType) {
            case 'SALES':
            case 'CUSTOMER_INVOICE':
                return { isSalesApplicable: true }
            case 'PURCHASE':
            case 'SUPPLIER_INVOICE':
                return { isPurchaseApplicable: true }
            case 'SERVICE':
                return { isServiceApplicable: true }
            case 'INVENTORY':
                return { isInventoryApplicable: true }
            case 'INVENTORY_PURCHASE':
                return {
                    isPurchaseApplicable: true,
                    isInventoryApplicable: true,
                }
            default:
                return {}
        }
    }

    private assertConfigurationValues(input: {
        taxCategory: string
        taxType: string
        calculationMethod?: string | null
        rateUnit?: string | null
        roundingMethod?: string | null
        roundingLevel?: string | null
        decimalPrecision?: number | null
    }) {
        if (!isFicoTaxCodeCategory(input.taxCategory)) {
            throw new BadRequestException(
                `Invalid tax category: ${input.taxCategory}`,
            )
        }
        if (!isFicoTaxCodeType(input.taxType)) {
            throw new BadRequestException(`Invalid tax type: ${input.taxType}`)
        }
        if (
            input.calculationMethod !== undefined &&
            input.calculationMethod !== null &&
            !isFicoTaxCalculationMethod(input.calculationMethod)
        ) {
            throw new BadRequestException(
                `Invalid calculation method: ${input.calculationMethod}`,
            )
        }
        if (
            input.rateUnit !== undefined &&
            input.rateUnit !== null &&
            !isFicoTaxRateUnit(input.rateUnit)
        ) {
            throw new BadRequestException(`Invalid rate unit: ${input.rateUnit}`)
        }
        if (
            input.roundingMethod !== undefined &&
            input.roundingMethod !== null &&
            !isFicoTaxRoundingMethod(input.roundingMethod)
        ) {
            throw new BadRequestException(
                `Invalid rounding method: ${input.roundingMethod}`,
            )
        }
        if (
            input.roundingLevel !== undefined &&
            input.roundingLevel !== null &&
            !isFicoTaxRoundingLevel(input.roundingLevel)
        ) {
            throw new BadRequestException(
                `Invalid rounding level: ${input.roundingLevel}`,
            )
        }
        if (
            input.decimalPrecision !== undefined &&
            input.decimalPrecision !== null &&
            (input.decimalPrecision < 0 || input.decimalPrecision > 10)
        ) {
            throw new BadRequestException(
                'Decimal precision must be between 0 and 10.',
            )
        }
    }

    private assertCompatibility(input: {
        taxCategory: string
        taxType: string
        isSalesApplicable: boolean
        isPurchaseApplicable: boolean
        isServiceApplicable: boolean
        isInventoryApplicable: boolean
    }) {
        const zeroLike = (ZERO_LIKE_TAX_TYPES as readonly string[]).includes(
            input.taxType,
        )
        const withholdingType = input.taxType === 'WITHHOLDING_TAX'
        const withholdingCategory =
            input.taxCategory === 'WITHHOLDING_TAX'

        if (withholdingType && !withholdingCategory) {
            throw new BadRequestException(
                'A withholding tax type must use the withholding tax category.',
            )
        }
        if (withholdingCategory && !withholdingType) {
            throw new BadRequestException(
                'The withholding tax category must use the withholding tax type.',
            )
        }
        if (withholdingCategory && zeroLike) {
            throw new BadRequestException(
                'Zero-rated, exempt and non-taxable types cannot use the withholding tax category.',
            )
        }
        if (!withholdingCategory && withholdingType) {
            throw new BadRequestException(
                'Withholding tax must use the withholding tax category.',
            )
        }
        if (
            input.taxCategory === 'SALES_TAX' &&
            !input.isSalesApplicable &&
            !input.isServiceApplicable
        ) {
            throw new BadRequestException(
                'A sales tax code must be applicable to sales or service transactions.',
            )
        }
        if (
            (input.taxCategory === 'PURCHASE_TAX' ||
                input.taxCategory === 'INPUT_TAX') &&
            !input.isPurchaseApplicable &&
            !input.isInventoryApplicable
        ) {
            throw new BadRequestException(
                'A purchase or input tax code must be applicable to purchase or inventory transactions.',
            )
        }
        if (
            input.taxCategory === 'OUTPUT_TAX' &&
            !input.isSalesApplicable &&
            !input.isServiceApplicable
        ) {
            throw new BadRequestException(
                'An output tax code must be applicable to sales or service transactions.',
            )
        }
        if (input.taxCategory === 'WITHHOLDING_TAX' && !withholdingType) {
            throw new BadRequestException(
                'The withholding tax category must use the withholding tax type.',
            )
        }
    }

    private assertStatusTransition(current: string, next: string) {
        if (current === next) return
        if (current === 'DRAFT') {
            if (next === 'ACTIVE') return
            throw new BadRequestException(
                `Tax code cannot move from ${current} to ${next}.`,
            )
        }
        if (current === 'ACTIVE') {
            if (next === 'INACTIVE') return
            throw new BadRequestException(
                `Tax code cannot move from ${current} to ${next}.`,
            )
        }
        if (current === 'INACTIVE') {
            if (next === 'ACTIVE') return
            throw new BadRequestException(
                `Tax code cannot move from ${current} to ${next}.`,
            )
        }
        throw new BadRequestException(`Unknown tax code status: ${current}`)
    }

    private assertRateValue(input: {
        rate: Prisma.Decimal
        rateUnit: string
        taxType: string
        effectiveFrom: Date
        effectiveTo: Date | null
    }) {
        if (!input.rate.isFinite() || input.rate.lt(0)) {
            throw new BadRequestException(
                'Tax rate must be a non-negative number.',
            )
        }
        if (input.rateUnit === 'PERCENTAGE' && input.rate.gt(100)) {
            throw new BadRequestException(
                'Percentage tax rate cannot exceed 100%.',
            )
        }
        if (
            (ZERO_LIKE_TAX_TYPES as readonly string[]).includes(input.taxType) &&
            !input.rate.eq(0)
        ) {
            throw new BadRequestException(
                'Zero-rated, exempt and non-taxable tax codes must use a 0% rate.',
            )
        }
        if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
            throw new BadRequestException(
                'Effective to date must be on or after effective from date.',
            )
        }
    }

    private async assertActivatable(
        taxCode: TaxCodeRecord,
        tx: Prisma.TransactionClient | PrismaService,
    ) {
        const errors: Array<{ field: string; message: string }> = []

        if (
            !taxCode.isSalesApplicable &&
            !taxCode.isPurchaseApplicable &&
            !taxCode.isServiceApplicable &&
            !taxCode.isInventoryApplicable
        ) {
            errors.push({
                field: 'isSalesApplicable',
                message:
                    'Select at least one applicable transaction type before activation.',
            })
        }

        const zeroLike = (ZERO_LIKE_TAX_TYPES as readonly string[]).includes(
            taxCode.taxType,
        )
        const withholding =
            taxCode.taxCategory === 'WITHHOLDING_TAX' ||
            taxCode.taxType === 'WITHHOLDING_TAX'
        const taxBearing = (TAX_BEARING_TYPES as readonly string[]).includes(
            taxCode.taxType,
        )

        const requiredAccounts: Array<{
            key: GlMappingField['key']
            label: string
            value: string | null
        }> = []

        if (taxCode.taxCategory === 'INPUT_TAX' || taxCode.taxCategory === 'PURCHASE_TAX') {
            requiredAccounts.push({
                key: 'inputTaxGlAccountId',
                label: 'Input tax',
                value: taxCode.inputTaxGlAccountId,
            })
        } else if (
            taxCode.taxCategory === 'OUTPUT_TAX' ||
            taxCode.taxCategory === 'SALES_TAX'
        ) {
            requiredAccounts.push({
                key: 'outputTaxGlAccountId',
                label: 'Output tax',
                value: taxCode.outputTaxGlAccountId,
            })
        } else if (!withholding && !zeroLike && taxBearing) {
            if (taxCode.isSalesApplicable || taxCode.isServiceApplicable) {
                requiredAccounts.push({
                    key: 'outputTaxGlAccountId',
                    label: 'Output tax',
                    value: taxCode.outputTaxGlAccountId,
                })
            }
            if (taxCode.isPurchaseApplicable) {
                requiredAccounts.push({
                    key: 'inputTaxGlAccountId',
                    label: 'Input tax',
                    value: taxCode.inputTaxGlAccountId,
                })
            }
        }

        if (withholding) {
            if (
                !taxCode.withholdingPayableGlAccountId &&
                !taxCode.withholdingReceivableGlAccountId
            ) {
                errors.push({
                    field: 'withholdingPayableGlAccountId',
                    message:
                        'A withholding tax payable or receivable G/L account is required before activation.',
                })
            }
        }

        for (const account of requiredAccounts) {
            if (!account.value) {
                errors.push({
                    field: account.key,
                    message: `${account.label} G/L account is required before activation.`,
                })
            }
        }

        if (!taxCode.isRecoverable && taxBearing && !zeroLike) {
            if (!taxCode.nonRecoverableTaxGlAccountId) {
                errors.push({
                    field: 'nonRecoverableTaxGlAccountId',
                    message:
                        'A non-recoverable tax expense G/L account is required when tax is not recoverable.',
                })
            }
        }

        if (taxBearing && !zeroLike) {
            const today = todayUtc()
            const hasUsableRate = taxCode.taxRates.some((rate) => {
                if (rate.status === 'INACTIVE') return false
                const from = toDateOnly(rate.effectiveFrom)
                const to = rate.effectiveTo
                    ? toDateOnly(rate.effectiveTo)
                    : null
                if (to && to < today) return false
                if (from > today) return !rate.rate.eq(0)
                if (from <= today) return !rate.rate.eq(0)
                return false
            })
            if (!hasUsableRate) {
                errors.push({
                    field: 'initialRate',
                    message:
                        'An effective or future non-zero tax rate is required before activation.',
                })
            }
        }

        if (errors.length > 0) {
            throw new BadRequestException({
                message: 'Tax code configuration is incomplete.',
                errors,
            })
        }

        await this.validateGlMappingsForCode(taxCode, tx)
    }

    private async validateGlMappingsForCode(
        taxCode: TaxCodeRecord,
        tx: Prisma.TransactionClient | PrismaService,
    ) {
        const mappings = {
            inputTaxGlAccountId: taxCode.inputTaxGlAccountId,
            outputTaxGlAccountId: taxCode.outputTaxGlAccountId,
            withholdingPayableGlAccountId:
                taxCode.withholdingPayableGlAccountId,
            withholdingReceivableGlAccountId:
                taxCode.withholdingReceivableGlAccountId,
            nonRecoverableTaxGlAccountId:
                taxCode.nonRecoverableTaxGlAccountId,
        }
        await this.validateGlMappings(
            taxCode.companyId ?? '',
            mappings,
            tx,
        )
    }

    private async validateGlMappings(
        companyId: string,
        mappings: Partial<Record<GlMappingField['key'], string | null>>,
        client: Prisma.TransactionClient | PrismaService = this.prisma,
    ) {
        const entries = GL_MAPPING_FIELDS.map((field) => ({
            field,
            value: mappings[field.key],
        })).filter(
            (entry): entry is { field: GlMappingField; value: string } =>
                typeof entry.value === 'string' && entry.value.length > 0,
        )

        if (entries.length === 0) return

        const settings = await client.ficoCompanyAccountingSettings.findUnique({
            where: { companyId },
            select: { chartOfAccountsId: true },
        })
        if (!settings?.chartOfAccountsId) {
            throw new BadRequestException(
                'Assign a chart of accounts to the company in Company Accounting Settings before mapping tax G/L accounts.',
            )
        }

        const ids = [...new Set(entries.map((entry) => entry.value))]
        const accounts = await client.ficoGlAccount.findMany({
            where: { id: { in: ids } },
            select: {
                id: true,
                chartOfAccountsId: true,
                accountCode: true,
                accountName: true,
                accountType: true,
                isPostingAccount: true,
                status: true,
            },
        })
        const accountMap = new Map(accounts.map((account) => [account.id, account]))
        const errors: Array<{ field: string; message: string }> = []

        for (const { field, value } of entries) {
            const account = accountMap.get(value)
            if (!account) {
                errors.push({
                    field: field.key,
                    message: `${field.label} G/L account was not found.`,
                })
                continue
            }
            if (account.chartOfAccountsId !== settings.chartOfAccountsId) {
                errors.push({
                    field: field.key,
                    message: `${field.label} account ${account.accountCode} does not belong to the company's assigned chart of accounts.`,
                })
                continue
            }
            if (account.status !== 'ACTIVE') {
                errors.push({
                    field: field.key,
                    message: `${field.label} account ${account.accountCode} is not active.`,
                })
                continue
            }
            if (!account.isPostingAccount) {
                errors.push({
                    field: field.key,
                    message: `${field.label} account ${account.accountCode} is not a posting account.`,
                })
                continue
            }
            if (!field.allowedAccountTypes.includes(account.accountType)) {
                errors.push({
                    field: field.key,
                    message: `${field.label} account ${account.accountCode} must be of type ${field.allowedAccountTypes.join(' or ')}.`,
                })
            }
        }

        if (errors.length > 0) {
            throw new BadRequestException({
                message: 'Invalid G/L account mapping.',
                errors,
            })
        }
    }

    // ---------------------------------------------------------------------
    // Internal utilities
    // ---------------------------------------------------------------------

    private async writeAudit(
        tx: Prisma.TransactionClient | PrismaService,
        input: {
            taxCodeId: string
            companyId: string
            actorId: string
            action: string
            entityType: string
            entityId: string
            previousValues: Record<string, unknown> | null
            newValues: Record<string, unknown> | null
            reason?: string | null
            metadata?: Record<string, unknown> | null
        },
    ) {
        await tx.ficoTaxCodeAuditLog.create({
            data: {
                taxCodeId: input.taxCodeId,
                companyId: input.companyId,
                actorId: input.actorId,
                action: input.action,
                entityType: input.entityType,
                entityId: input.entityId,
                previousValues: input.previousValues
                    ? this.toJson(input.previousValues)
                    : undefined,
                newValues: input.newValues
                    ? this.toJson(input.newValues)
                    : undefined,
                reason: input.reason ?? undefined,
                metadata: input.metadata
                    ? this.toJson(input.metadata)
                    : undefined,
            },
        })
    }

    private toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
        return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
    }
}
