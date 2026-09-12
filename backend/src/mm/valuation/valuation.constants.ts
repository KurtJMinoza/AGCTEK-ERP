export const VALUATION_METHODS = [
    'FIFO',
    'MOVING_AVERAGE',
    'STANDARD_COST',
] as const

export type ValuationMethod = (typeof VALUATION_METHODS)[number]

export const LANDED_COST_TYPES = [
    'FREIGHT',
    'INSURANCE',
    'CUSTOMS',
    'DUTY',
    'HANDLING',
    'OTHER',
] as const

export type LandedCostType = (typeof LANDED_COST_TYPES)[number]

export const ALLOCATION_BASES = [
    'QUANTITY',
    'WEIGHT',
    'VOLUME',
    'VALUE',
    'MANUAL',
    'CUSTOM',
] as const

export type AllocationBase = (typeof ALLOCATION_BASES)[number]

/** CUSTOM is treated as MANUAL for allocation math. */
export function normalizeAllocationBase(base: string): string {
    return base === 'CUSTOM' ? 'MANUAL' : base
}

export const PRICE_VARIANCE_TYPES = [
    'PPV',
    'IPV',
    'LANDED',
    'REVALUATION',
] as const

export type PriceVarianceType = (typeof PRICE_VARIANCE_TYPES)[number]

export const DEFAULT_COST_ELEMENTS: Array<{
    code: string
    name: string
    costType: LandedCostType
}> = [
    { code: 'FREIGHT', name: 'Freight', costType: 'FREIGHT' },
    { code: 'INSURANCE', name: 'Insurance', costType: 'INSURANCE' },
    { code: 'CUSTOMS', name: 'Customs', costType: 'CUSTOMS' },
    { code: 'DUTY', name: 'Duty', costType: 'DUTY' },
    { code: 'HANDLING', name: 'Handling', costType: 'HANDLING' },
    { code: 'OTHER', name: 'Other Charges', costType: 'OTHER' },
]
