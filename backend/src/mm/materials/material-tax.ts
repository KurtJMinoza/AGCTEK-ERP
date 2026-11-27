import { BadRequestException } from '@nestjs/common'

/**
 * Product tax classification is owned by MM Material Master.
 *
 * FICO owns the tax code and its effective-dated rates. This module only maps
 * the material classification to a compatible FICO tax type and projects the
 * read-only result to MM and SD. It never stores a second tax rate.
 */
export const MATERIAL_TAX_CLASSIFICATIONS = [
    'VATABLE',
    'VAT_EXEMPT',
    'ZERO_RATED',
] as const

export type MaterialTaxClassification =
    (typeof MATERIAL_TAX_CLASSIFICATIONS)[number]

export const PRICE_TAX_TREATMENTS = [
    'VAT_INCLUSIVE',
    'VAT_EXCLUSIVE',
] as const

export type PriceTaxTreatment = (typeof PRICE_TAX_TREATMENTS)[number]

export const MATERIAL_TAX_STATUSES = ['ACTIVE', 'INACTIVE'] as const

export type MaterialTaxStatus = (typeof MATERIAL_TAX_STATUSES)[number]

export const ZERO_LIKE_TAX_TYPES = [
    'ZERO_RATED_TAX',
    'EXEMPT_TAX',
    'NON_TAXABLE',
] as const

export const TAX_TYPES_BY_CLASSIFICATION: Record<
    MaterialTaxClassification,
    readonly string[]
> = {
    VATABLE: ['VAT', 'PERCENTAGE_TAX'],
    VAT_EXEMPT: ['EXEMPT_TAX', 'NON_TAXABLE'],
    ZERO_RATED: ['ZERO_RATED_TAX'],
}

export const TAX_CLASSIFICATION_LABELS: Record<
    MaterialTaxClassification,
    string
> = {
    VATABLE: 'VATable',
    VAT_EXEMPT: 'VAT Exempt',
    ZERO_RATED: 'Zero-Rated',
}

export const PRICE_TAX_TREATMENT_LABELS: Record<PriceTaxTreatment, string> = {
    VAT_INCLUSIVE: 'VAT Inclusive',
    VAT_EXCLUSIVE: 'VAT Exclusive',
}

export type MaterialTaxEffectiveStatus =
    | 'ACTIVE'
    | 'INACTIVE'
    | 'SCHEDULED'
    | 'EXPIRED'
    | 'INCOMPLETE'
    | 'NOT_CONFIGURED'

type DateLike = Date | string | null | undefined

export type TaxRateLike = {
    rate: unknown
    rateUnit?: string | null
    effectiveFrom: DateLike
    effectiveTo?: DateLike
    status?: string | null
}

export type TaxCodeLike = {
    id: string
    companyId?: string | null
    code: string
    name: string
    taxType: string
    status: string
    taxRates?: TaxRateLike[]
}

export type MaterialTaxFields = {
    taxClassification?: string | null
    taxCodeId?: string | null
    priceTaxTreatment?: string | null
    taxStatus?: string | null
    taxEffectiveFrom?: DateLike
    taxEffectiveTo?: DateLike
    taxDescription?: string | null
}

export type MaterialTaxProjection = {
    configured: boolean
    readyForSale: boolean
    source: 'MM_MATERIAL_MASTER'
    classification: MaterialTaxClassification | null
    classificationLabel: string | null
    taxCodeId: string | null
    taxCode: string | null
    taxCodeName: string | null
    taxType: string | null
    taxRate: number | null
    rateUnit: string | null
    rateEffectiveFrom: string | null
    rateEffectiveTo: string | null
    priceTaxTreatment: PriceTaxTreatment | null
    priceTaxTreatmentLabel: string | null
    status: MaterialTaxStatus | null
    effectiveStatus: MaterialTaxEffectiveStatus
    effectiveFrom: string | null
    effectiveTo: string | null
    description: string | null
    warnings: string[]
}

const DAY_MS = 24 * 60 * 60 * 1000

export function taxDateOnly(value: DateLike): Date | null {
    if (value === null || value === undefined || value === '') return null
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return new Date(
        Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
        ),
    )
}

export function taxTodayUtc(): Date {
    return taxDateOnly(new Date()) as Date
}

export function taxDateString(value: DateLike): string | null {
    const date = taxDateOnly(value)
    return date ? date.toISOString().slice(0, 10) : null
}

export function isMaterialTaxClassification(
    value: unknown,
): value is MaterialTaxClassification {
    return (
        typeof value === 'string' &&
        (MATERIAL_TAX_CLASSIFICATIONS as readonly string[]).includes(value)
    )
}

export function isPriceTaxTreatment(
    value: unknown,
): value is PriceTaxTreatment {
    return (
        typeof value === 'string' &&
        (PRICE_TAX_TREATMENTS as readonly string[]).includes(value)
    )
}

export function isMaterialTaxStatus(
    value: unknown,
): value is MaterialTaxStatus {
    return (
        typeof value === 'string' &&
        (MATERIAL_TAX_STATUSES as readonly string[]).includes(value)
    )
}

export function isZeroLikeTaxType(taxType: string): boolean {
    return (ZERO_LIKE_TAX_TYPES as readonly string[]).includes(taxType)
}

export function compatibleClassifications(
    taxType: string,
): MaterialTaxClassification[] {
    return MATERIAL_TAX_CLASSIFICATIONS.filter((classification) =>
        TAX_TYPES_BY_CLASSIFICATION[classification].includes(taxType),
    )
}

export function assertTaxCodeCompatible(
    classification: MaterialTaxClassification,
    taxType: string,
): void {
    if (!TAX_TYPES_BY_CLASSIFICATION[classification].includes(taxType)) {
        throw new BadRequestException(
            `Tax code type ${taxType} is not compatible with ${TAX_CLASSIFICATION_LABELS[classification]}. ` +
                `Allowed FICO tax types: ${TAX_TYPES_BY_CLASSIFICATION[classification].join(', ')}.`,
        )
    }
}

/**
 * Current FICO rate for a tax code. Zero-like codes are valid without a rate
 * row (the FICO tax code engine treats them the same way); a VAT-bearing code
 * without a current rate is reported as missing, never as 0%.
 */
export function resolveCurrentTaxRate(
    taxCode: TaxCodeLike | null | undefined,
    today: Date = taxTodayUtc(),
): {
    rate: number
    rateUnit: string
    effectiveFrom: string | null
    effectiveTo: string | null
} | null {
    if (!taxCode) return null
    const day = taxDateOnly(today) as Date
    const current = (taxCode.taxRates ?? [])
        .filter((rate) => {
            if (rate.status === 'INACTIVE') return false
            const from = taxDateOnly(rate.effectiveFrom)
            if (!from || from > day) return false
            const to = taxDateOnly(rate.effectiveTo)
            return !to || to >= day
        })
        .sort((a, b) => {
            const aFrom = taxDateOnly(a.effectiveFrom)?.getTime() ?? 0
            const bFrom = taxDateOnly(b.effectiveFrom)?.getTime() ?? 0
            return bFrom - aFrom
        })[0]

    if (current) {
        return {
            rate: Number(current.rate),
            rateUnit: current.rateUnit ?? 'PERCENTAGE',
            effectiveFrom: taxDateString(current.effectiveFrom),
            effectiveTo: taxDateString(current.effectiveTo),
        }
    }

    if (isZeroLikeTaxType(taxCode.taxType)) {
        return {
            rate: 0,
            rateUnit: 'PERCENTAGE',
            effectiveFrom: null,
            effectiveTo: null,
        }
    }
    return null
}

export function materialTaxEffectiveStatus(
    config: MaterialTaxFields,
    taxCode: TaxCodeLike | null | undefined,
    today: Date = taxTodayUtc(),
): MaterialTaxEffectiveStatus {
    if (!config.taxClassification) return 'NOT_CONFIGURED'
    if (!config.taxCodeId || !config.priceTaxTreatment) return 'INCOMPLETE'
    if (config.taxStatus !== 'ACTIVE') return 'INACTIVE'

    const day = taxDateOnly(today) as Date
    const from = taxDateOnly(config.taxEffectiveFrom)
    const to = taxDateOnly(config.taxEffectiveTo)
    if (from && from > day) return 'SCHEDULED'
    if (to && to < day) return 'EXPIRED'
    if (!taxCode || taxCode.status !== 'ACTIVE') return 'INACTIVE'
    return 'ACTIVE'
}

export function buildMaterialTaxProjection(
    material: MaterialTaxFields & {
        id?: string
        materialCode?: string
        sku?: string | null
        taxCode?: TaxCodeLike | null
    },
    today: Date = taxTodayUtc(),
): MaterialTaxProjection {
    const classification = isMaterialTaxClassification(
        material.taxClassification,
    )
        ? material.taxClassification
        : null
    const treatment = isPriceTaxTreatment(material.priceTaxTreatment)
        ? material.priceTaxTreatment
        : null
    const status = isMaterialTaxStatus(material.taxStatus)
        ? material.taxStatus
        : null
    const taxCode = material.taxCode ?? null
    const rate = resolveCurrentTaxRate(taxCode, today)
    const effectiveStatus = materialTaxEffectiveStatus(
        material,
        taxCode,
        today,
    )
    const configured = Boolean(
        classification &&
            material.taxCodeId &&
            treatment &&
            status,
    )
    const zeroLike = taxCode ? isZeroLikeTaxType(taxCode.taxType) : false
    const readyForSale =
        configured &&
        effectiveStatus === 'ACTIVE' &&
        (zeroLike || rate !== null)

    const warnings: string[] = []
    if (!configured) {
        warnings.push('Tax Classification Not Configured')
    }
    if (classification && !material.taxCodeId) {
        warnings.push('Tax code is required for the selected classification')
    }
    if (taxCode && taxCode.status !== 'ACTIVE') {
        warnings.push(`FICO tax code ${taxCode.code} is ${taxCode.status}`)
    }
    if (effectiveStatus === 'SCHEDULED') {
        warnings.push('Tax configuration starts in the future')
    }
    if (effectiveStatus === 'EXPIRED') {
        warnings.push('Tax configuration has expired')
    }
    if (configured && !zeroLike && !rate) {
        warnings.push(
            `No active FICO tax rate for tax code ${taxCode?.code ?? material.taxCodeId}`,
        )
    }

    return {
        configured,
        readyForSale,
        source: 'MM_MATERIAL_MASTER',
        classification,
        classificationLabel: classification
            ? TAX_CLASSIFICATION_LABELS[classification]
            : null,
        taxCodeId: material.taxCodeId ?? null,
        taxCode: taxCode?.code ?? null,
        taxCodeName: taxCode?.name ?? null,
        taxType: taxCode?.taxType ?? null,
        taxRate: rate?.rate ?? null,
        rateUnit: rate?.rateUnit ?? null,
        rateEffectiveFrom: rate?.effectiveFrom ?? null,
        rateEffectiveTo: rate?.effectiveTo ?? null,
        priceTaxTreatment: treatment,
        priceTaxTreatmentLabel: treatment
            ? PRICE_TAX_TREATMENT_LABELS[treatment]
            : null,
        status,
        effectiveStatus,
        effectiveFrom: taxDateString(material.taxEffectiveFrom),
        effectiveTo: taxDateString(material.taxEffectiveTo),
        description: material.taxDescription ?? null,
        warnings,
    }
}

/** True when any tax field is present on the incoming DTO. */
export function hasMaterialTaxFields(dto: Record<string, unknown>): boolean {
    return [
        'taxClassification',
        'taxCodeId',
        'priceTaxTreatment',
        'taxStatus',
        'taxEffectiveFrom',
        'taxEffectiveTo',
        'taxDescription',
    ].some((key) => dto[key] !== undefined)
}

/** History snapshot shape; the rate is copied so FICO rate changes cannot rewrite it. */
export function materialTaxSnapshot(
    material: MaterialTaxFields & { taxCode?: TaxCodeLike | null },
    today: Date = taxTodayUtc(),
) {
    const rate = resolveCurrentTaxRate(material.taxCode ?? null, today)
    return {
        taxClassification: material.taxClassification ?? null,
        taxCodeId: material.taxCodeId ?? null,
        taxCodeValue: material.taxCode?.code ?? null,
        taxCodeName: material.taxCode?.name ?? null,
        taxType: material.taxCode?.taxType ?? null,
        taxRate: rate?.rate ?? null,
        rateUnit: rate?.rateUnit ?? null,
        priceTaxTreatment: material.priceTaxTreatment ?? null,
        taxStatus: material.taxStatus ?? null,
        taxEffectiveFrom: taxDateOnly(material.taxEffectiveFrom),
        taxEffectiveTo: taxDateOnly(material.taxEffectiveTo),
        taxDescription: material.taxDescription ?? null,
    }
}

export function materialTaxChanged(
    before: MaterialTaxFields,
    after: MaterialTaxFields,
): boolean {
    const norm = (value: DateLike) => taxDateString(value)
    return (
        (before.taxClassification ?? null) !==
            (after.taxClassification ?? null) ||
        (before.taxCodeId ?? null) !== (after.taxCodeId ?? null) ||
        (before.priceTaxTreatment ?? null) !==
            (after.priceTaxTreatment ?? null) ||
        (before.taxStatus ?? null) !== (after.taxStatus ?? null) ||
        norm(before.taxEffectiveFrom) !== norm(after.taxEffectiveFrom) ||
        norm(before.taxEffectiveTo) !== norm(after.taxEffectiveTo) ||
        (before.taxDescription ?? null) !== (after.taxDescription ?? null)
    )
}

export function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * DAY_MS)
}
