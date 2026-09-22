import type {
    MmExceptionDomain,
    MmExceptionItem,
    MmExceptionSeverity,
} from './exception-center.types'

const STALE_DAYS = 90

export function buildExceptionId(
    domain: MmExceptionDomain,
    type: string,
    sourceId: string,
): string {
    return `${domain}:${type}:${sourceId}`
}

export function parseExceptionId(id: string): {
    domain: MmExceptionDomain
    type: string
    sourceId: string
} | null {
    const parts = id.split(':')
    if (parts.length < 3) return null
    const [domain, type, ...rest] = parts
    return {
        domain: domain as MmExceptionDomain,
        type,
        sourceId: rest.join(':'),
    }
}

export function ageHoursFrom(date: Date, now = new Date()): number {
    return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 3600000))
}

export function isStale(detectedAt: Date, now = new Date()): boolean {
    const ms = now.getTime() - detectedAt.getTime()
    return ms > STALE_DAYS * 86400000
}

export function mapMatchSeverity(raw: string): MmExceptionSeverity {
    if (raw === 'BLOCKED' || raw === 'CRITICAL') return 'CRITICAL'
    if (raw === 'VARIANCE' || raw === 'HIGH') return 'HIGH'
    return 'MEDIUM'
}

export function sortExceptions(items: MmExceptionItem[]): MmExceptionItem[] {
    const rank: Record<MmExceptionSeverity, number> = {
        CRITICAL: 0,
        HIGH: 1,
        MEDIUM: 2,
        LOW: 3,
    }
    return [...items].sort((a, b) => {
        const sr = rank[a.severity] - rank[b.severity]
        if (sr !== 0) return sr
        return b.ageHours - a.ageHours
    })
}

export function paginate<T>(
    items: T[],
    page = 1,
    limit = 50,
): { data: T[]; total: number; page: number; limit: number; totalPages: number } {
    const safePage = Math.max(1, page)
    const safeLimit = Math.min(Math.max(1, limit), 200)
    const total = items.length
    const start = (safePage - 1) * safeLimit
    return {
        data: items.slice(start, start + safeLimit),
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    }
}

export function warehouseScope(
    warehouseId?: string,
    plantId?: string,
): { warehouseId?: string; plantId?: string } {
    return {
        ...(warehouseId ? { warehouseId } : {}),
        ...(plantId ? { plantId } : {}),
    }
}
