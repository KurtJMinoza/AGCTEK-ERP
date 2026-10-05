/**
 * Cargo-first TMS rules — pure functions (no Prisma) so they are unit-testable
 * and reusable from seeds. See docs/SCM_TMS_CARGO_FIRST.md.
 */

export type TmsStopType = 'SHIP' | 'TO' | 'RETURN'

export type LoadPlanState =
    | 'DRAFT'
    | 'VALIDATED'
    | 'READY'
    | 'ASSIGNED'
    | 'DISPATCHED'
    | 'COMPLETED'
    | 'CANCELLED'

/** Load plan statuses that hold the vehicle (partial unique index in DB). */
export const ACTIVE_LOAD_PLAN_STATES: LoadPlanState[] = [
    'DRAFT',
    'VALIDATED',
    'READY',
    'ASSIGNED',
    'DISPATCHED',
]

/** Cargo may be added/removed only while the plan is not yet READY. */
export const EDITABLE_LOAD_PLAN_STATES: LoadPlanState[] = ['DRAFT', 'VALIDATED']

export const LOAD_PLAN_TRANSITIONS: Record<LoadPlanState, LoadPlanState[]> = {
    DRAFT: ['VALIDATED', 'CANCELLED'],
    VALIDATED: ['READY', 'DRAFT', 'CANCELLED'],
    READY: ['ASSIGNED', 'DRAFT', 'CANCELLED'],
    ASSIGNED: ['DISPATCHED', 'READY'],
    DISPATCHED: ['COMPLETED', 'READY'],
    COMPLETED: [],
    CANCELLED: [],
}

export function canTransitionLoadPlan(
    from: LoadPlanState,
    to: LoadPlanState,
): boolean {
    return LOAD_PLAN_TRANSITIONS[from]?.includes(to) ?? false
}

// ─── Capacity ────────────────────────────────────────────────────────────────

export type VehicleCapacity = {
    capacityQty: number | null | undefined
    capacityWeightKg?: number | null
    capacityVolumeM3?: number | null
}

export type CargoMeasure = {
    qty: number
    weightKg?: number | null
    volumeM3?: number | null
}

export type LoadTotals = {
    totalQty: number
    totalWeightKg: number
    totalVolumeM3: number
}

export type LoadCapacityResult = LoadTotals & {
    capacityQty: number
    capacityWeightKg: number | null
    capacityVolumeM3: number | null
    remainingQty: number
    ok: boolean
    message: string | null
}

export function sumLoad(lines: CargoMeasure[]): LoadTotals {
    return lines.reduce<LoadTotals>(
        (acc, line) => ({
            totalQty: acc.totalQty + Math.max(0, Math.trunc(line.qty || 0)),
            totalWeightKg: acc.totalWeightKg + Math.max(0, line.weightKg ?? 0),
            totalVolumeM3: acc.totalVolumeM3 + Math.max(0, line.volumeM3 ?? 0),
        }),
        { totalQty: 0, totalWeightKg: 0, totalVolumeM3: 0 },
    )
}

/**
 * MVP capacity: Σ qty ≤ capacityQty (primary, required). Weight / volume are
 * checked only when the vehicle has a positive limit for them.
 */
export function checkLoadCapacity(
    vehicle: VehicleCapacity,
    lines: CargoMeasure[],
): LoadCapacityResult {
    const totals = sumLoad(lines)
    const capacityQty = Math.max(0, Math.trunc(vehicle.capacityQty ?? 0))
    const capacityWeightKg =
        vehicle.capacityWeightKg && vehicle.capacityWeightKg > 0
            ? vehicle.capacityWeightKg
            : null
    const capacityVolumeM3 =
        vehicle.capacityVolumeM3 && vehicle.capacityVolumeM3 > 0
            ? vehicle.capacityVolumeM3
            : null

    const base = {
        ...totals,
        capacityQty,
        capacityWeightKg,
        capacityVolumeM3,
        remainingQty: capacityQty - totals.totalQty,
    }

    if (capacityQty <= 0) {
        return {
            ...base,
            ok: false,
            message: 'Vehicle item capacity (capacityQty) is not set',
        }
    }
    if (totals.totalQty > capacityQty) {
        return {
            ...base,
            ok: false,
            message: `Load exceeds vehicle item capacity (${totals.totalQty} / ${capacityQty} items)`,
        }
    }
    if (capacityWeightKg != null && totals.totalWeightKg > capacityWeightKg) {
        return {
            ...base,
            ok: false,
            message: `Load exceeds vehicle weight capacity (${round2(totals.totalWeightKg)} / ${capacityWeightKg} kg)`,
        }
    }
    if (capacityVolumeM3 != null && totals.totalVolumeM3 > capacityVolumeM3) {
        return {
            ...base,
            ok: false,
            message: `Load exceeds vehicle volume capacity (${round2(totals.totalVolumeM3)} / ${capacityVolumeM3} m³)`,
        }
    }
    return { ...base, ok: true, message: null }
}

function round2(n: number): number {
    return Math.round(n * 100) / 100
}

// ─── Locations ───────────────────────────────────────────────────────────────

export type CargoLocation = {
    warehouseId?: string | null
    warehouseName?: string | null
    address?: string | null
    lat?: number | null
    lng?: number | null
}

export function normalizeAddress(address: string): string {
    return address.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** WH:<id> when a Warehouse master id is known, else ADDR:<normalised address>. */
export function locationKey(loc: CargoLocation | null | undefined): string | null {
    if (!loc) return null
    if (loc.warehouseId) return `WH:${loc.warehouseId}`
    const address = loc.address?.trim()
    if (address) return `ADDR:${normalizeAddress(address)}`
    return null
}

// ─── Stop generation ─────────────────────────────────────────────────────────

export type StopSourceLine = {
    loadPlanLineId: string
    shipmentLineId: string
    shipmentId: string
    customerName?: string | null
    ship: CargoLocation | null
    to: CargoLocation | null
    ret?: CargoLocation | null
    earliestDeliveryAt?: Date | null
    latestDeliveryAt?: Date | null
}

export type StopDraft = {
    sequence: number
    stopType: TmsStopType
    locationKey: string
    warehouseId: string | null
    name: string
    address: string
    lat: number | null
    lng: number | null
    windowStart: Date | null
    windowEnd: Date | null
    lines: Array<{ loadPlanLineId: string; shipmentLineId: string }>
    shipmentIds: string[]
}

const TYPE_ORDER: TmsStopType[] = ['SHIP', 'TO', 'RETURN']

export type StopBuildResult = {
    stops: StopDraft[]
    /** Lines missing a SHIP or TO location — caller should reject. */
    errors: string[]
}

/**
 * ShipmentLine → LoadPlanLine → locations → stops.
 * Dedupe by (locationKey, stopType); baseline order SHIP → TO → RETURN.
 * Within SHIP / RETURN: first appearance. Within TO: earliest delivery window,
 * then first appearance. Lines with a return location add RETURN stops, and the
 * trip always ends with a RETURN to the first pickup warehouse (no cargo lines
 * unless a line returns goods there).
 */
export function buildTripStops(lines: StopSourceLine[]): StopBuildResult {
    const errors: string[] = []
    const groups = new Map<
        string,
        {
            stopType: TmsStopType
            key: string
            loc: CargoLocation
            order: number
            lines: StopSourceLine[]
        }
    >()
    let order = 0

    const add = (
        stopType: TmsStopType,
        loc: CargoLocation | null | undefined,
        line: StopSourceLine,
    ): boolean => {
        const key = locationKey(loc)
        if (!key || !loc) return false
        const groupKey = `${stopType}|${key}`
        const existing = groups.get(groupKey)
        if (existing) {
            existing.lines.push(line)
            if (existing.loc.lat == null && loc.lat != null) {
                existing.loc = { ...existing.loc, lat: loc.lat, lng: loc.lng }
            }
        } else {
            groups.set(groupKey, {
                stopType,
                key,
                loc,
                order: order++,
                lines: [line],
            })
        }
        return true
    }

    for (const line of lines) {
        if (!add('SHIP', line.ship, line)) {
            errors.push(`Shipment line ${line.shipmentLineId} has no ship-from location`)
        }
        if (!add('TO', line.to, line)) {
            errors.push(`Shipment line ${line.shipmentLineId} has no ship-to location`)
        }
        if (line.ret) add('RETURN', line.ret, line)
    }

    const origin = [...groups.values()]
        .filter((g) => g.stopType === 'SHIP')
        .sort((a, b) => a.order - b.order)[0]
    if (origin) {
        const homeKey = `RETURN|${origin.key}`
        const home = groups.get(homeKey)
        if (home) {
            home.order = Number.MAX_SAFE_INTEGER
        } else {
            groups.set(homeKey, {
                stopType: 'RETURN',
                key: origin.key,
                loc: origin.loc,
                order: Number.MAX_SAFE_INTEGER,
                lines: [],
            })
        }
    }

    const minTime = (ls: StopSourceLine[]) => {
        const times = ls
            .map((l) => l.earliestDeliveryAt?.getTime())
            .filter((t): t is number => t != null)
        return times.length ? Math.min(...times) : Number.POSITIVE_INFINITY
    }

    const sorted = [...groups.values()].sort((a, b) => {
        const typeDiff =
            TYPE_ORDER.indexOf(a.stopType) - TYPE_ORDER.indexOf(b.stopType)
        if (typeDiff !== 0) return typeDiff
        if (a.stopType === 'TO') {
            const wa = minTime(a.lines)
            const wb = minTime(b.lines)
            if (wa !== wb) return wa - wb
        }
        return a.order - b.order
    })

    const stops = sorted.map((group, index): StopDraft => {
        const starts = group.lines
            .map((l) => l.earliestDeliveryAt)
            .filter((d): d is Date => d != null)
        const ends = group.lines
            .map((l) => l.latestDeliveryAt)
            .filter((d): d is Date => d != null)
        const customers = [
            ...new Set(
                group.lines
                    .map((l) => l.customerName?.trim())
                    .filter((c): c is string => Boolean(c)),
            ),
        ]
        const place =
            group.loc.warehouseName?.trim() ||
            group.loc.address?.trim() ||
            group.key
        const name =
            group.stopType === 'SHIP'
                ? `Load · ${place}`
                : group.stopType === 'RETURN'
                  ? `Return · ${place}`
                  : customers.length === 1
                    ? `Deliver · ${customers[0]}`
                    : customers.length > 1
                      ? `Deliver · ${customers.length} customers`
                      : 'Deliver'
        return {
            sequence: index + 1,
            stopType: group.stopType,
            locationKey: group.key,
            warehouseId: group.loc.warehouseId ?? null,
            name,
            address: group.loc.address?.trim() || place,
            lat: group.loc.lat ?? null,
            lng: group.loc.lng ?? null,
            windowStart:
                group.stopType === 'TO' && starts.length
                    ? new Date(Math.min(...starts.map((d) => d.getTime())))
                    : null,
            windowEnd:
                group.stopType === 'TO' && ends.length
                    ? new Date(Math.max(...ends.map((d) => d.getTime())))
                    : null,
            lines: group.lines.map((l) => ({
                loadPlanLineId: l.loadPlanLineId,
                shipmentLineId: l.shipmentLineId,
            })),
            shipmentIds: [...new Set(group.lines.map((l) => l.shipmentId))],
        }
    })

    return { stops, errors }
}

// ─── Reorder ────────────────────────────────────────────────────────────────

/** Stable id for a generated stop before it is persisted (preview / create). */
export function stopKey(stop: Pick<StopDraft, 'stopType' | 'locationKey'>): string {
    return `${stop.stopType}|${stop.locationKey}`
}

/**
 * Apply a planner order (list of stopKeys) to generated stops using the same
 * rules as persisted reorder. Sequence is renumbered 1..n.
 */
export function applyStopOrder(
    stops: StopDraft[],
    order: string[] | null | undefined,
): { stops: StopDraft[]; error: string | null } {
    if (!order || order.length === 0) return { stops, error: null }
    const error = validateStopReorder(
        stops.map((s) => ({ id: stopKey(s), stopType: s.stopType })),
        order,
    )
    if (error) return { stops, error }
    const byKey = new Map(stops.map((s) => [stopKey(s), s]))
    return {
        stops: order.map((key, index) => ({ ...byKey.get(key)!, sequence: index + 1 })),
        error: null,
    }
}

/**
 * Planner reorder rules: the request must contain every stop exactly once,
 * keep SHIP → TO → RETURN blocks, and keep SHIP / RETURN relative order.
 * Only TO stops may move. Returns an error message or null.
 */
export function validateStopReorder(
    current: Array<{ id: string; stopType: TmsStopType | null }>,
    requestedIds: string[],
): string | null {
    if (requestedIds.length !== current.length) {
        return 'stopIds must list every stop of the trip exactly once'
    }
    const byId = new Map(current.map((s) => [s.id, s]))
    if (new Set(requestedIds).size !== requestedIds.length) {
        return 'stopIds contains duplicates'
    }
    for (const id of requestedIds) {
        if (!byId.has(id)) return `Stop ${id} does not belong to this trip`
    }
    const requested = requestedIds.map((id) => byId.get(id)!)
    if (requested.some((s) => s.stopType == null)) {
        return 'Only cargo-generated stops can be reordered here'
    }
    for (let i = 1; i < requested.length; i++) {
        const prev = TYPE_ORDER.indexOf(requested[i - 1].stopType!)
        const cur = TYPE_ORDER.indexOf(requested[i].stopType!)
        if (cur < prev) {
            return 'Stops must stay in SHIP → TO → RETURN order'
        }
    }
    for (const fixed of ['SHIP', 'RETURN'] as const) {
        const before = current.filter((s) => s.stopType === fixed).map((s) => s.id)
        const after = requested.filter((s) => s.stopType === fixed).map((s) => s.id)
        if (before.join('|') !== after.join('|')) {
            return `${fixed} stops cannot be reordered — only delivery (TO) stops`
        }
    }
    return null
}
