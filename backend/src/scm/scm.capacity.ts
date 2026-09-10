export type LoadItem = {
    quantity?: number | null
}

export type VehicleQtyCapacity = {
    capacityQty?: number | null
}

export type CapacityCheck = {
    loadedQty: number
    capacityQty: number | null
    pctQty: number | null
    canFit: boolean
    message: string | null
}

function toNonNegInt(value: number | null | undefined): number | null {
    if (value == null) return null
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n) || n < 0) return null
    return Math.trunc(n)
}

export function sumQty(items: LoadItem[]): number {
    return items.reduce((sum, item) => sum + (toNonNegInt(item.quantity) ?? 0), 0)
}

export function pctQty(loaded: number, capacity: number | null): number | null {
    if (capacity == null || capacity <= 0) return null
    return (loaded / capacity) * 100
}

export function computeCapacity(
    vehicle: VehicleQtyCapacity | null | undefined,
    shipments: LoadItem[],
): CapacityCheck {
    const loadedQty = sumQty(shipments)
    const capacityQty = toNonNegInt(vehicle?.capacityQty)
    const pct = pctQty(loadedQty, capacityQty)

    if (capacityQty == null || capacityQty <= 0 || pct == null) {
        return {
            loadedQty,
            capacityQty,
            pctQty: null,
            canFit: false,
            message:
                'Vehicle item capacity is missing or invalid — cannot compute load %.',
        }
    }

    if (pct > 100) {
        return {
            loadedQty,
            capacityQty,
            pctQty: pct,
            canFit: false,
            message: `Load exceeds vehicle item capacity (${loadedQty} / ${capacityQty} items).`,
        }
    }

    return {
        loadedQty,
        capacityQty,
        pctQty: pct,
        canFit: true,
        message: null,
    }
}
