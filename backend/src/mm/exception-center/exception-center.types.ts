export const MM_EXCEPTION_DOMAINS = [
    'procurement',
    'receiving',
    'quality',
    'inventory',
    'warehouse',
    'inventory_control',
    'transfers',
    'mrp',
    'integration',
] as const

export type MmExceptionDomain = (typeof MM_EXCEPTION_DOMAINS)[number]

export const MM_EXCEPTION_SEVERITIES = [
    'CRITICAL',
    'HIGH',
    'MEDIUM',
    'LOW',
] as const

export type MmExceptionSeverity = (typeof MM_EXCEPTION_SEVERITIES)[number]

export type MmExceptionDocumentRef = {
    type: string
    id: string
    number?: string
}

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
    document?: MmExceptionDocumentRef
    href: string
    metadata?: Record<string, unknown>
}

export type MmExceptionFilters = {
    companyId: string
    plantId?: string
    warehouseId?: string
    severity?: MmExceptionSeverity
    domain?: MmExceptionDomain
    status?: string
    dateFrom?: string
    dateTo?: string
    includeStale?: boolean
    page?: number
    limit?: number
    role?: string
    authority?: string
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
