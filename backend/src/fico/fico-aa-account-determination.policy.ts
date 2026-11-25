/**
 * Phase 04.17–04.18 — asset acquisition and depreciation determination (CONFIG_ONLY).
 * AA workflow owns capitalization eligibility; determination resolves accounts only.
 */

export type FicoAaAssetClassHint = {
    assetClassCode: string
    label: string
    acquisitionKey: string
    depreciationExpenseKey: string
    accumulatedDepreciationKey: string
}

export const FICO_AA_ASSET_CLASS_HINTS: FicoAaAssetClassHint[] = [
    {
        assetClassCode: 'BUILDINGS',
        label: 'Buildings',
        acquisitionKey: 'ASSET_ACQUISITION',
        depreciationExpenseKey: 'DEPRECIATION_EXPENSE',
        accumulatedDepreciationKey: 'ACCUMULATED_DEPRECIATION',
    },
    {
        assetClassCode: 'MACHINERY',
        label: 'Machinery and equipment',
        acquisitionKey: 'ASSET_ACQUISITION',
        depreciationExpenseKey: 'DEPRECIATION_EXPENSE',
        accumulatedDepreciationKey: 'ACCUMULATED_DEPRECIATION',
    },
    {
        assetClassCode: 'VEHICLES',
        label: 'Transportation equipment',
        acquisitionKey: 'ASSET_ACQUISITION',
        depreciationExpenseKey: 'DEPRECIATION_EXPENSE',
        accumulatedDepreciationKey: 'ACCUMULATED_DEPRECIATION',
    },
    {
        assetClassCode: 'IT_EQUIPMENT',
        label: 'Computer equipment',
        acquisitionKey: 'ASSET_ACQUISITION',
        depreciationExpenseKey: 'DEPRECIATION_EXPENSE',
        accumulatedDepreciationKey: 'ACCUMULATED_DEPRECIATION',
    },
    {
        assetClassCode: 'FURNITURE',
        label: 'Furniture and fixtures',
        acquisitionKey: 'ASSET_ACQUISITION',
        depreciationExpenseKey: 'DEPRECIATION_EXPENSE',
        accumulatedDepreciationKey: 'ACCUMULATED_DEPRECIATION',
    },
    {
        assetClassCode: 'CONSTRUCTION',
        label: 'Assets under construction',
        acquisitionKey: 'ASSET_UNDER_CONSTRUCTION',
        depreciationExpenseKey: 'DEPRECIATION_EXPENSE',
        accumulatedDepreciationKey: 'ACCUMULATED_DEPRECIATION',
    },
]

export const FICO_PHASE0417_TRANSACTION_KEYS = [
    'ASSET_ACQUISITION',
    'ASSET_CLEARING',
    'ASSET_UNDER_CONSTRUCTION',
] as const

export const FICO_PHASE0418_TRANSACTION_KEYS = [
    'DEPRECIATION_EXPENSE',
    'ACCUMULATED_DEPRECIATION',
    'ASSET_IMPAIRMENT',
    'ASSET_DISPOSAL_GAIN',
    'ASSET_DISPOSAL_LOSS',
] as const