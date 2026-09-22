/** Canonical MM demand modules — external domains register under these ids. */
export const MM_DEMAND_MODULES = {
    SD: 'SD',
    PRODUCTION: 'PRODUCTION',
    MAINTENANCE: 'MAINTENANCE',
    PROJECTS: 'PROJECTS',
    MM: 'MM',
} as const

export type MmDemandModuleId =
    (typeof MM_DEMAND_MODULES)[keyof typeof MM_DEMAND_MODULES]

export const MM_DEMAND_STATUSES = ['OPEN', 'CANCELLED', 'FULFILLED'] as const
export type MmDemandStatus = (typeof MM_DEMAND_STATUSES)[number]

/** Query passed to every MmDemandProvider — MRP uses the same filter for all modules. */
export type MmDemandQuery = {
    companyId: string
    materialIds: string[]
    warehouseIds: string[]
    asOf: Date
    horizonEnd: Date
    statuses?: MmDemandStatus[]
}

/**
 * Normalized demand line — the single contract MRP and reservations consume.
 * MM does not own the external document; only references it.
 */
export type MmNormalizedDemandLine = {
    sourceModule: string
    sourceDocumentType: string
    sourceDocumentId: string
    sourceDocumentLineId?: string | null
    companyId: string
    materialId: string
    warehouseId?: string | null
    plantId?: string | null
    requiredDate: Date
    quantity: number
    uomId: string
    priority: number
    status: MmDemandStatus
    /** Stable idempotency key: module:type:doc[:line] */
    demandReferenceKey: string
    /** Legacy MRP source label derived from sourceModule */
    sourceType?: string
    remarks?: string | null
}

export type MmDemandSyncInput = Omit<
    MmNormalizedDemandLine,
    'demandReferenceKey'
> & {
    demandReferenceKey?: string
    createdBy?: string | null
}
