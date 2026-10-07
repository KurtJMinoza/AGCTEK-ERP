/**
 * Trip stop location integrity — the ONE path that turns cargo lines into
 * stop locations and decides whether a stop is routable.
 *
 * - SHIP (DELIVERY) / RETURN → MM Warehouse master address + lat/lng.
 * - SHIP (customer PICKUP)  → shipment ship-from address + coordinates.
 * - TO                       → shipment ship-to address + coordinates.
 *
 * Coordinates are never invented: missing data stays null and is reported.
 * See docs/SCM_TMS_CARGO_FIRST.md › Location integrity.
 */
import {
    isValidCoordinate,
    warehouseRoutingIssue,
    type WarehouseGeoState,
    type WarehouseRoutingIssueCode,
} from '../../mm/warehouse/warehouse-geocode.rules'
import {
    applyStopOrder,
    buildTripStops,
    type CargoLocation,
    type StopDraft,
    type StopLocationKind,
    type StopSourceLine,
    type TmsStopType,
} from './tms.rules'

export type ResolvableWarehouse = WarehouseGeoState & { address: string | null }

/** Shape of a ShipmentLine with the refs needed to resolve stop locations. */
export type ResolvableShipmentLine = {
    id: string
    shipmentId: string
    shipFromWarehouseId: string | null
    shipFromAddress: string | null
    shipFromLat: number | null
    shipFromLng: number | null
    shipToAddress: string | null
    shipToLat: number | null
    shipToLng: number | null
    returnWarehouseId: string | null
    returnAddress: string | null
    returnLat: number | null
    returnLng: number | null
    shipment: {
        reference?: string | null
        customerName: string | null
        movementType: 'DELIVERY' | 'PICKUP'
        earliestDeliveryAt: Date | null
        latestDeliveryAt: Date | null
    }
    shipFromWarehouse: ResolvableWarehouse | null
    returnWarehouse: ResolvableWarehouse | null
}

export type ResolvedStopSource = {
    line: StopSourceLine
    /** Structural problems (e.g. DELIVERY line without a ship-from warehouse) */
    errors: string[]
    warehouses: ResolvableWarehouse[]
}

function warehouseLocation(
    warehouseId: string,
    warehouse: ResolvableWarehouse | null,
): CargoLocation {
    // Coordinates and address come only from the master — never from line copies.
    return {
        kind: 'WAREHOUSE',
        warehouseId,
        warehouseName: warehouse?.name ?? null,
        address: warehouse?.address?.trim() || warehouse?.name || null,
        lat: warehouse?.lat ?? null,
        lng: warehouse?.lng ?? null,
    }
}

function addressLocation(
    address: string | null,
    lat: number | null,
    lng: number | null,
): CargoLocation | null {
    if (!address?.trim()) return null
    return { kind: 'ADDRESS', address, lat, lng }
}

/** ShipmentLine (+ load plan line id) → stop builder input, movement-aware. */
export function resolveStopSource(
    loadPlanLineId: string,
    line: ResolvableShipmentLine,
): ResolvedStopSource {
    const errors: string[] = []
    const ref = line.shipment.reference ?? line.shipmentId
    const warehouses: ResolvableWarehouse[] = []

    let ship: CargoLocation | null = null
    if (line.shipFromWarehouseId) {
        ship = warehouseLocation(line.shipFromWarehouseId, line.shipFromWarehouse)
        if (line.shipFromWarehouse) warehouses.push(line.shipFromWarehouse)
    } else if (line.shipment.movementType === 'PICKUP') {
        ship = addressLocation(line.shipFromAddress, line.shipFromLat, line.shipFromLng)
    } else {
        errors.push(
            `Shipment ${ref} line ${line.id} ships from a free-text address — assign an MM ship-from warehouse`,
        )
    }

    let ret: CargoLocation | null = null
    if (line.returnWarehouseId) {
        ret = warehouseLocation(line.returnWarehouseId, line.returnWarehouse)
        if (line.returnWarehouse) warehouses.push(line.returnWarehouse)
    } else if (line.returnAddress?.trim()) {
        if (line.shipment.movementType === 'PICKUP') {
            ret = addressLocation(line.returnAddress, line.returnLat, line.returnLng)
        } else {
            errors.push(
                `Shipment ${ref} line ${line.id} returns to a free-text address — assign an MM return warehouse`,
            )
        }
    }

    return {
        line: {
            loadPlanLineId,
            shipmentLineId: line.id,
            shipmentId: line.shipmentId,
            customerName: line.shipment.customerName,
            ship,
            to: addressLocation(line.shipToAddress, line.shipToLat, line.shipToLng),
            ret,
            earliestDeliveryAt: line.shipment.earliestDeliveryAt,
            latestDeliveryAt: line.shipment.latestDeliveryAt,
        },
        errors,
        warehouses,
    }
}

/** Resolve every line of a load plan; warehouses are deduped by id. */
export function resolveStopSources(
    lines: Array<{ id: string; shipmentLine: ResolvableShipmentLine }>,
): { lines: StopSourceLine[]; errors: string[]; warehouses: Map<string, ResolvableWarehouse> } {
    const out: StopSourceLine[] = []
    const errors: string[] = []
    const warehouses = new Map<string, ResolvableWarehouse>()
    for (const l of lines) {
        const r = resolveStopSource(l.id, l.shipmentLine)
        out.push(r.line)
        errors.push(...r.errors)
        for (const w of r.warehouses) warehouses.set(w.id, w)
    }
    return { lines: out, errors, warehouses }
}

// ─── Validation ──────────────────────────────────────────────────────────────

export type StopCoordIssueCode =
    | WarehouseRoutingIssueCode
    | 'WAREHOUSE_REQUIRED'
    | 'MISSING_COORDS'

export type StopCoordIssue = {
    code: StopCoordIssueCode
    message: string
    sequence: number
}

export type ValidatableStop = {
    sequence: number
    stopType: TmsStopType | null
    locationKind: StopLocationKind | null
    warehouseId: string | null
    name: string | null
    address: string | null
    lat: number | null
    lng: number | null
}

/**
 * Central stop coordinate check. WAREHOUSE stops need an existing, active,
 * geocode-confirmed MM warehouse AND valid stop coordinates; ADDRESS stops
 * need valid coordinates. Returns null when routable.
 */
export function validateStopCoordinates(
    stop: ValidatableStop,
    warehouse: WarehouseGeoState | null | undefined,
): StopCoordIssue | null {
    const label = `Stop ${stop.sequence} (${stop.name || stop.address || 'unnamed'})`
    if (stop.locationKind === 'WAREHOUSE') {
        if (!stop.warehouseId) {
            return {
                code: 'WAREHOUSE_REQUIRED',
                sequence: stop.sequence,
                message: `${label} must reference an MM warehouse but has none — recreate the trip after fixing the shipment`,
            }
        }
        const issue = warehouseRoutingIssue(stop.warehouseId, warehouse)
        if (issue) return { ...issue, sequence: stop.sequence, message: `${label}: ${issue.message}` }
    }
    if (stop.lat == null || stop.lng == null) {
        return {
            code: 'MISSING_COORDS',
            sequence: stop.sequence,
            message: `${label} has no coordinates — set the location on the shipment`,
        }
    }
    if (!isValidCoordinate(stop.lat, stop.lng)) {
        return {
            code: 'INVALID_COORDS',
            sequence: stop.sequence,
            message: `${label} has invalid coordinates (${stop.lat}, ${stop.lng})`,
        }
    }
    return null
}

/**
 * Location kind of a persisted stop. New stops carry the snapshot; legacy
 * stops are inferred conservatively — a SHIP stop that serves DELIVERY
 * shipments, or any WH: key, must be warehouse-backed.
 */
export function inferLocationKind(stop: {
    locationKind: string | null
    warehouseId: string | null
    locationKey: string | null
    stopType: TmsStopType | null
    shipmentMovementTypes: Array<'DELIVERY' | 'PICKUP'>
}): StopLocationKind {
    if (stop.locationKind === 'WAREHOUSE' || stop.locationKind === 'ADDRESS') {
        return stop.locationKind
    }
    if (stop.warehouseId || stop.locationKey?.startsWith('WH:')) return 'WAREHOUSE'
    if (stop.stopType === 'SHIP' && stop.shipmentMovementTypes.includes('DELIVERY')) {
        return 'WAREHOUSE'
    }
    return 'ADDRESS'
}

/**
 * Load plan lines → ordered stops + structural errors + per-stop coordinate
 * issues. Used by candidates, route preview and trip create (confirm).
 */
export function planTripStops(
    lines: Array<{ id: string; shipmentLine: ResolvableShipmentLine }>,
    stopOrder?: string[] | null,
): { stops: StopDraft[]; errors: string[]; issues: StopCoordIssue[] } {
    const resolved = resolveStopSources(lines)
    const built = buildTripStops(resolved.lines)
    const errors = [...resolved.errors, ...built.errors]
    let stops = built.stops
    if (errors.length === 0 && stopOrder) {
        const ordered = applyStopOrder(stops, stopOrder)
        if (ordered.error) errors.push(ordered.error)
        else stops = ordered.stops
    }
    const issues = stops
        .map((s) =>
            validateStopCoordinates(s, s.warehouseId ? resolved.warehouses.get(s.warehouseId) : null),
        )
        .filter((i): i is StopCoordIssue => i != null)
    return { stops, errors, issues }
}

export function formatStopIssues(issues: StopCoordIssue[]): string {
    return `Trip has stops without valid locations: ${issues.map((i) => i.message).join('; ')}`
}
