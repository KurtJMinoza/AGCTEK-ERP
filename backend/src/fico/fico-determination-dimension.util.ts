import type { FicoDeterminationDimension } from './fico-account-determination.constants'

/** Dimensions matched by exact id (no case folding). */
export const FICO_DETERMINATION_ID_DIMENSIONS: readonly FicoDeterminationDimension[] = [
    'valuationClassId',
    'branchId',
    'bankAccountId',
    'taxCodeId',
] as const

export function ficoDeterminationDimensionEqual(
    dimension: FicoDeterminationDimension,
    configured: string,
    supplied: string,
): boolean {
    if ((FICO_DETERMINATION_ID_DIMENSIONS as readonly string[]).includes(dimension)) {
        return configured === supplied
    }
    return configured.trim().toUpperCase() === supplied.trim().toUpperCase()
}

export function normaliseDeterminationCode(value: string | null | undefined) {
    const text = value?.trim()
    return text ? text.toUpperCase() : null
}

export type DeterminationRuleDimensionInput = {
    materialGroupCode?: string | null
    taxCodeId?: string | null
    salesChannelCode?: string | null
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
}

export function persistenceFromExtendedDimensions(
    input: DeterminationRuleDimensionInput,
) {
    return {
        materialGroupCode: normaliseDeterminationCode(input.materialGroupCode),
        taxCodeId: input.taxCodeId?.trim() || null,
        salesChannelCode: normaliseDeterminationCode(input.salesChannelCode),
        paymentMethodCode: normaliseDeterminationCode(input.paymentMethodCode),
        bankAccountId: input.bankAccountId?.trim() || null,
        paymentProviderCode: normaliseDeterminationCode(input.paymentProviderCode),
        currencyCode: input.currencyCode?.trim()
            ? input.currencyCode.trim().toUpperCase()
            : null,
        branchId: input.branchId?.trim() || null,
        assetClassCode: normaliseDeterminationCode(input.assetClassCode),
        depreciationAreaCode: normaliseDeterminationCode(input.depreciationAreaCode),
        documentTypeCode: normaliseDeterminationCode(input.documentTypeCode),
        productionOrderTypeCode: normaliseDeterminationCode(
            input.productionOrderTypeCode,
        ),
        costElementCategoryCode: normaliseDeterminationCode(
            input.costElementCategoryCode,
        ),
        controllingAreaCode: normaliseDeterminationCode(input.controllingAreaCode),
    }
}