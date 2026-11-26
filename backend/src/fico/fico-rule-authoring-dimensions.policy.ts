import {
    FICO_AA_DIMENSION_MODULES,
    FICO_DETERMINATION_DIMENSIONS,
    FICO_MATERIAL_DIMENSION_MODULES,
    FICO_SALES_DIMENSION_MODULES,
    FICO_TREASURY_DIMENSION_MODULES,
    type FicoDeterminationDimension,
    type FicoDeterminationSourceModule,
} from './fico-account-determination.constants'
import { ficoCatalogEntryForKey } from './fico-account-determination-policy'

export type RuleAuthoringDimensionHint = {
    key: FicoDeterminationDimension
    label: string
    required: boolean
    wildcardAllowed: boolean
}

const DIMENSION_LABELS: Record<FicoDeterminationDimension, string> = {
    valuationClassId: 'Valuation class',
    materialTypeCode: 'Material type',
    movementType: 'Movement type',
    customerAccountGroup: 'Customer account group',
    supplierAccountGroup: 'Supplier account group',
    salesOrganization: 'Sales organization',
    distributionChannel: 'Distribution channel',
    paymentMethodCode: 'Payment method',
    bankAccountId: 'Bank account',
    paymentProviderCode: 'Payment provider',
    currencyCode: 'Currency',
    branchId: 'Branch',
    assetClassCode: 'Asset class',
    depreciationAreaCode: 'Depreciation area',
    documentTypeCode: 'Document type',
    productionOrderTypeCode: 'Production order type',
    costElementCategoryCode: 'Cost element category',
    controllingAreaCode: 'Controlling area',
}

const MM_DIMENSIONS: FicoDeterminationDimension[] = [
    'valuationClassId',
    'materialTypeCode',
    'movementType',
]

const SD_DIMENSIONS: FicoDeterminationDimension[] = [
    'salesOrganization',
    'distributionChannel',
    'customerAccountGroup',
]

const TREASURY_DIMENSIONS: FicoDeterminationDimension[] = [
    'paymentMethodCode',
    'bankAccountId',
    'paymentProviderCode',
    'currencyCode',
    'branchId',
]

const AA_DIMENSIONS: FicoDeterminationDimension[] = [
    'assetClassCode',
    'depreciationAreaCode',
    'documentTypeCode',
]

const PP_CO_DIMENSIONS: FicoDeterminationDimension[] = [
    'valuationClassId',
    'productionOrderTypeCode',
    'costElementCategoryCode',
    'controllingAreaCode',
]

const AP_DIMENSIONS: FicoDeterminationDimension[] = [
    'supplierAccountGroup',
    'paymentMethodCode',
    'currencyCode',
]

const AR_DIMENSIONS: FicoDeterminationDimension[] = [
    'customerAccountGroup',
    'paymentMethodCode',
]

function moduleDimensionPool(
    sourceModule: string,
): FicoDeterminationDimension[] {
    const module = sourceModule.toUpperCase()
    if ((FICO_MATERIAL_DIMENSION_MODULES as readonly string[]).includes(module)) {
        return [...MM_DIMENSIONS, ...PP_CO_DIMENSIONS]
    }
    if ((FICO_SALES_DIMENSION_MODULES as readonly string[]).includes(module)) {
        return [...SD_DIMENSIONS, ...AR_DIMENSIONS]
    }
    if ((FICO_TREASURY_DIMENSION_MODULES as readonly string[]).includes(module)) {
        return [...TREASURY_DIMENSIONS, ...SD_DIMENSIONS]
    }
    if ((FICO_AA_DIMENSION_MODULES as readonly string[]).includes(module)) {
        return AA_DIMENSIONS
    }
    if (module === 'AP') return AP_DIMENSIONS
    if (module === 'CO') return PP_CO_DIMENSIONS
    return [...FICO_DETERMINATION_DIMENSIONS]
}

export function ficoRuleAuthoringDimensions(
    sourceModule: FicoDeterminationSourceModule | string,
    transactionKeyCode?: string | null,
): RuleAuthoringDimensionHint[] {
    const pool = new Set(moduleDimensionPool(sourceModule))
    const entry = transactionKeyCode
        ? ficoCatalogEntryForKey(transactionKeyCode)
        : undefined
    if (entry?.requiresValuationClass) {
        pool.add('valuationClassId')
    }
    // Reconciliation keys are grouped by partner account group whichever module
    // raises them (e.g. SUPPLIER_RECON from MM invoice verification or AP).
    if (entry?.accountingCategory.toUpperCase() === 'PAYABLE') {
        pool.add('supplierAccountGroup')
    }
    if (entry?.accountingCategory.toUpperCase() === 'RECEIVABLE') {
        pool.add('customerAccountGroup')
    }
  return [...pool].map((key) => ({
        key,
        label: DIMENSION_LABELS[key],
        required: key === 'valuationClassId' && entry?.requiresValuationClass === true,
        wildcardAllowed: true,
    }))
}