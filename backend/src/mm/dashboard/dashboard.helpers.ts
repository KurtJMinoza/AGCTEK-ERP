import { createHash } from 'crypto'

export type DashboardFilters = {
    companyId: string
    warehouseId?: string
    branchId?: string
    materialCategoryId?: string
    supplierId?: string
    dateFrom?: string
    dateTo?: string
    deadStockDays?: number
    agingBuckets?: string
}

export type AgingBucketDef = { name: string; min: number; max: number }

export const DEFAULT_AGING_BUCKETS: AgingBucketDef[] = [
    { name: '0-30', min: 0, max: 30 },
    { name: '31-60', min: 31, max: 60 },
    { name: '61-90', min: 61, max: 90 },
    { name: '90+', min: 91, max: 999999 },
]

export type KpiCard = {
    key: string
    label: string
    value: number
    group:
        | 'inventory'
        | 'procurement'
        | 'receiving'
        | 'warehouse'
        | 'control'
        | 'suppliers'
    href: string
    query?: Record<string, string>
    /** When true, hide from warehouse-only roles even if inventory is visible */
    finance?: boolean
}

export type DashboardAlert = {
    type: string
    severity: 'info' | 'warning' | 'danger'
    title: string
    count: number
    href: string
    query?: Record<string, string>
}

export const CACHE_TTL_MS = 5 * 60 * 1000

export function buildCacheKey(
    metricType: string,
    filters: DashboardFilters,
): string {
    const payload = JSON.stringify({
        metricType,
        companyId: filters.companyId,
        warehouseId: filters.warehouseId ?? null,
        branchId: filters.branchId ?? null,
        materialCategoryId: filters.materialCategoryId ?? null,
        supplierId: filters.supplierId ?? null,
        dateFrom: filters.dateFrom ?? null,
        dateTo: filters.dateTo ?? null,
        deadStockDays: filters.deadStockDays ?? 90,
        agingBuckets: filters.agingBuckets ?? null,
    })
    return createHash('sha256').update(payload).digest('hex').slice(0, 48)
}

export function isCacheFresh(expiresAt: Date, now = new Date()): boolean {
    return expiresAt.getTime() > now.getTime()
}

export function agingBucket(daysSinceInbound: number): string {
    return resolveAgingBucket(daysSinceInbound, DEFAULT_AGING_BUCKETS)
}

export function parseAgingBuckets(spec?: string): AgingBucketDef[] {
    if (!spec?.trim()) return DEFAULT_AGING_BUCKETS
    return spec.split('|').map((part) => {
        const trimmed = part.trim()
        if (trimmed.endsWith('+')) {
            const min = parseInt(trimmed.slice(0, -1), 10)
            return { name: trimmed, min, max: 999999 }
        }
        const [a, b] = trimmed.split('-').map((s) => parseInt(s, 10))
        return { name: trimmed, min: a, max: b }
    })
}

export function resolveAgingBucket(
    daysSinceInbound: number,
    buckets: AgingBucketDef[],
): string {
    for (const b of buckets) {
        if (daysSinceInbound >= b.min && daysSinceInbound <= b.max) {
            return b.name
        }
    }
    return buckets[buckets.length - 1]?.name ?? '90+'
}

export function computeTurnover(issueQty: number, avgOnHand: number): number {
    if (avgOnHand <= 0) return 0
    return Number((issueQty / avgOnHand).toFixed(4))
}

export function isOverduePo(
    expectedDeliveryDate: Date | null | undefined,
    status: string,
    today = new Date(),
): boolean {
    if (!expectedDeliveryDate) return false
    const open = ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(status)
    if (!open) return false
    const startOfDay = new Date(today)
    startOfDay.setHours(0, 0, 0, 0)
    return expectedDeliveryDate.getTime() < startOfDay.getTime()
}

export function resolveVisibility(
    role?: string,
    authorityCsv?: string,
): { inventory: boolean; procurement: boolean; warehouse: boolean; analytics: boolean } {
    const auth = new Set(
        (authorityCsv ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
    )
    if (role === 'super_admin' || role === 'admin' || auth.has('super_admin') || auth.has('admin')) {
        return { inventory: true, procurement: true, warehouse: true, analytics: true }
    }
    // If no tags provided, show all (dev-friendly until JWT scopes exist)
    if (auth.size === 0 && !role) {
        return { inventory: true, procurement: true, warehouse: true, analytics: true }
    }
    return {
        inventory: auth.has('mm.inventory') || auth.size === 0,
        procurement: auth.has('mm.procurement') || auth.size === 0,
        warehouse: auth.has('mm.warehouse') || auth.size === 0,
        analytics: auth.has('mm.analytics') || auth.has('mm.inventory') || auth.size === 0,
    }
}

export function sumStockByStatus(
    rows: { stockStatus: string; _sum: { quantity: unknown } }[],
): { available: number; quality: number; blocked: number; other: number } {
    let available = 0
    let quality = 0
    let blocked = 0
    let other = 0
    for (const r of rows) {
        const q = Number(r._sum.quantity ?? 0)
        if (r.stockStatus === 'UNRESTRICTED') available += q
        else if (r.stockStatus === 'QUALITY_INSPECTION') quality += q
        else if (r.stockStatus === 'BLOCKED') blocked += q
        else other += q
    }
    return { available, quality, blocked, other }
}
