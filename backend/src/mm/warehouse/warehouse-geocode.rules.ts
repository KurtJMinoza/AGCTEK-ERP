/**
 * Warehouse geocode integrity — pure rules shared by MM (master data) and
 * SCM (trip stop resolution). MM Warehouse is the only source of pickup /
 * return coordinates; nothing here ever invents a coordinate.
 */

/** Numeric, in range, and not the (0,0) "null island" placeholder. */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
    return (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180 &&
        !(lat === 0 && lng === 0)
    )
}

export type WarehouseGeoState = {
    id: string
    code?: string | null
    name?: string | null
    status: string
    deletedAt: Date | null
    lat: number | null
    lng: number | null
    geocodeConfirmed: boolean
}

export type WarehouseRoutingIssueCode =
    | 'WAREHOUSE_MISSING'
    | 'WAREHOUSE_DELETED'
    | 'WAREHOUSE_INACTIVE'
    | 'WAREHOUSE_UNCONFIRMED'
    | 'INVALID_COORDS'

export type WarehouseRoutingIssue = { code: WarehouseRoutingIssueCode; message: string }

/** Why a warehouse cannot be used as a routable stop, or null when it can. */
export function warehouseRoutingIssue(
    warehouseId: string,
    warehouse: WarehouseGeoState | null | undefined,
): WarehouseRoutingIssue | null {
    if (!warehouse) {
        return { code: 'WAREHOUSE_MISSING', message: `Warehouse ${warehouseId} not found` }
    }
    const label = warehouse.code || warehouse.name || warehouse.id
    if (warehouse.deletedAt) {
        return { code: 'WAREHOUSE_DELETED', message: `Warehouse ${label} is deleted` }
    }
    if (warehouse.status !== 'ACTIVE') {
        return { code: 'WAREHOUSE_INACTIVE', message: `Warehouse ${label} is ${warehouse.status}` }
    }
    if (!warehouse.geocodeConfirmed) {
        return {
            code: 'WAREHOUSE_UNCONFIRMED',
            message: `Warehouse ${label} location is not confirmed — geocode and confirm it in MM › Warehouses`,
        }
    }
    if (!isValidCoordinate(warehouse.lat, warehouse.lng)) {
        return {
            code: 'INVALID_COORDS',
            message: `Warehouse ${label} has invalid coordinates — re-confirm its location`,
        }
    }
    return null
}

export function normalizeWarehouseAddress(address: string | null | undefined): string {
    return (address ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Address text changed in a way that invalidates a confirmed pin. */
export function addressChanged(
    before: string | null | undefined,
    after: string | null | undefined,
): boolean {
    return normalizeWarehouseAddress(before) !== normalizeWarehouseAddress(after)
}
