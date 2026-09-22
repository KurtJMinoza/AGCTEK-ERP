/** Semantic accounting effect hints — FICO resolves GL accounts; MM never hardcodes account numbers. */
export const MM_ACCOUNTING_EFFECT_HINTS = {
    INVENTORY_INCREASE: 'INVENTORY_INCREASE',
    GRIR_ACCRUAL: 'GRIR_ACCRUAL',
    INVENTORY_DECREASE: 'INVENTORY_DECREASE',
    COGS_EXPENSE: 'COGS_EXPENSE',
    INVENTORY_LOSS: 'INVENTORY_LOSS',
    INVENTORY_ADJUSTMENT: 'INVENTORY_ADJUSTMENT',
    GRIR_REVERSAL: 'GRIR_REVERSAL',
    TRANSFER_CLEARING: 'TRANSFER_CLEARING',
    INVENTORY_REVALUATION: 'INVENTORY_REVALUATION',
    LANDED_COST: 'LANDED_COST',
    PRICE_VARIANCE: 'PRICE_VARIANCE',
    REVERSAL: 'REVERSAL',
} as const

export type MmAccountingEffectHint =
    (typeof MM_ACCOUNTING_EFFECT_HINTS)[keyof typeof MM_ACCOUNTING_EFFECT_HINTS]

export type MmAccountingLineContext = {
    materialId: string
    materialTypeId?: string | null
    materialTypeCode?: string | null
    valuationClassId?: string | null
    valuationClassCode?: string | null
    movementType: string
    quantity: number
    unitCost: number
    totalCost: number
    costCenterId?: string | null
    warehouseId?: string | null
    plantId?: string | null
}

export type MmAccountingEventPayloadV2 = {
    schemaVersion: 'v2'
    eventType: string
    companyId: string
    plantId?: string | null
    postingDate: string
    transactionDate: string
    currencyCode: string
    documentType: string
    documentId: string
    sourceModule: string
    accountingEffects: MmAccountingEffectHint[]
    lines: MmAccountingLineContext[]
    financiallyRelevant: boolean
    sourceEventId?: string
    sourceTransactionId?: string | null
    idempotencyKey?: string
    issuePurpose?: string
    adjustmentReason?: string
    transferFromWarehouseId?: string
    transferToWarehouseId?: string
    correlationId?: string
    totalValue?: number
    [key: string]: unknown
}

export type MmAccountingStandaloneInput = {
    eventType: string
    sourceModule: string
    documentType: string
    documentId: string
    companyId: string
    plantId?: string | null
    postingDate: Date | string
    currencyCode?: string
    sourceEventId?: string
    sourceTransactionId?: string | null
    idempotencyKey?: string
    accountingEffects: MmAccountingEffectHint[]
    lines: Array<{
        materialId: string
        warehouseId?: string | null
        movementType: string
        quantity: number
        unitCost: number
        totalCost: number
        costCenterId?: string | null
    }>
    financiallyRelevant?: boolean
    extraPayload?: Record<string, unknown>
}

export type MmAccountingDispatchPayload = MmAccountingEventPayloadV2 & {
    mmAccountingEventId?: string
}
