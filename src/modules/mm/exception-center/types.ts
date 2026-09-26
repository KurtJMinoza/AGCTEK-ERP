export type MmExceptionSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export type MmExceptionDomain =
    | 'procurement'
    | 'receiving'
    | 'quality'
    | 'inventory'
    | 'warehouse'
    | 'inventory_control'
    | 'transfers'
    | 'mrp'
    | 'integration'

export type MmExceptionItem = {
    id: string
    type: string
    domain: MmExceptionDomain
    severity: MmExceptionSeverity
    status: string
    title: string
    message?: string
    source: string
    detectedAt: string
    dueAt?: string
    ageHours: number
    stale: boolean
    companyId: string
    plantId?: string
    warehouseId?: string
    supplierId?: string
    materialId?: string
    owner?: string
    recommendedAction: string
    document?: { type: string; id: string; number?: string }
    href: string
    metadata?: Record<string, unknown>
}

export type MmExceptionCounts = {
    total: number
    bySeverity: Record<MmExceptionSeverity, number>
    byDomain: Partial<Record<MmExceptionDomain, number>>
}

export type MmExceptionListResponse = {
    data: MmExceptionItem[]
    meta: {
        total: number
        page: number
        limit: number
        totalPages: number
        counts: MmExceptionCounts
    }
}
