export type LoadItem = {
    quantity?: number | null
}

export type VehicleQtyCapacity = {
    capacityQty?: number | null
}

export type LoadLevel = 'unknown' | 'under' | 'near' | 'over'

export type CapacitySnapshot = {
    loadedQty: number
    capacityQty: number | null
    pctQty: number | null
    level: LoadLevel
    canFit: boolean
    message: string | null
}

export const NEAR_LIMIT_PCT = 85

export function sumQty(items: LoadItem[]): number {
    return items.reduce((sum, item) => sum + (toNonNegInt(item.quantity) ?? 0), 0)
}

export function pctQty(
    loaded: number,
    capacity: number | null | undefined,
): number | null {
    const cap = toNonNegInt(capacity)
    if (cap == null || cap <= 0) return null
    return (loaded / cap) * 100
}

export function loadLevel(pct: number | null): LoadLevel {
    if (pct == null || !Number.isFinite(pct)) return 'unknown'
    if (pct > 100) return 'over'
    if (pct >= NEAR_LIMIT_PCT) return 'near'
    return 'under'
}

export function computeCapacity(
    vehicle: VehicleQtyCapacity | null | undefined,
    shipments: LoadItem[],
): CapacitySnapshot {
    const loadedQty = sumQty(shipments)
    const capacityQty = toNonNegInt(vehicle?.capacityQty)
    const pct = pctQty(loadedQty, capacityQty)
    const level = loadLevel(pct)
    const canFit = level !== 'unknown' && level !== 'over'

    let message: string | null = null
    if (level === 'unknown') {
        message =
            'Vehicle item capacity is missing or invalid — cannot compute load %.'
    } else if (level === 'over') {
        message = `Load exceeds vehicle item capacity (${loadedQty} / ${capacityQty} items).`
    }

    return {
        loadedQty,
        capacityQty,
        pctQty: pct,
        level,
        canFit,
        message,
    }
}

export function canFit(
    vehicle: VehicleQtyCapacity | null | undefined,
    shipments: LoadItem[],
): boolean {
    return computeCapacity(vehicle, shipments).canFit
}

export function formatLoadLine(snapshot: CapacitySnapshot): string {
    if (snapshot.capacityQty == null || snapshot.pctQty == null) return '—'
    return `${snapshot.loadedQty}/${snapshot.capacityQty} (${Math.round(snapshot.pctQty)}%)`
}

function toNonNegInt(value: number | null | undefined): number | null {
    if (value == null) return null
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n) || n < 0) return null
    return Math.trunc(n)
}
