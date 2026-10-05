import {
    BadRequestException,
    ConflictException,
    Injectable,
} from '@nestjs/common'
import {
    DriverStatus,
    LoadPlanStatus,
    Prisma,
    TripStatus,
    TripStopType,
} from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { VehiclesService } from '../vehicles/vehicles.service'
import {
    assertFound,
    optionalDate,
    optionalString,
    parsePagination,
    requireString,
    type ListQuery,
} from '../scm.utils'
import { checkLoadCapacity, validateStopReorder } from './tms.rules'
import { loadPlanInclude, warehouseGeoSelect } from './tms-load-plans.service'
import {
    formatStopIssues,
    inferLocationKind,
    planTripStops,
    validateStopCoordinates,
    type StopCoordIssue,
} from './stop-location.rules'

/** Trip statuses that hold a vehicle / driver (1 vehicle ↔ 1 active trip). */
const ACTIVE_TRIP_STATUSES: TripStatus[] = [
    TripStatus.DRAFT,
    TripStatus.PLANNED,
    TripStatus.ASSIGNED,
    TripStatus.READY,
    TripStatus.DISPATCHED,
    TripStatus.IN_TRANSIT,
]

/** Planner may edit stops / driver only before dispatch. */
const PLANNING_TRIP_STATUSES: TripStatus[] = [TripStatus.PLANNED, TripStatus.READY]

const STOP_ACTION: Record<TripStopType, string> = {
    SHIP: 'PICKUP',
    TO: 'DROPOFF',
    // driver deliverStop only settles DROPOFF links; RETURN is informational
    RETURN: 'RETURN',
}

export const tmsTripInclude = {
    vehicle: true,
    driver: true,
    loadPlan: { select: { id: true, code: true, status: true, totalQty: true } },
    stops: {
        orderBy: { sequence: 'asc' as const },
        include: {
            warehouse: { select: { id: true, code: true, name: true } },
            shipments: { include: { shipment: true } },
            lines: {
                include: {
                    shipmentLine: {
                        select: {
                            id: true,
                            lineNo: true,
                            materialCode: true,
                            description: true,
                            quantity: true,
                            shipment: {
                                select: { id: true, reference: true, customerName: true },
                            },
                        },
                    },
                },
            },
        },
    },
} satisfies Prisma.TripInclude

function isUniqueViolation(err: unknown): boolean {
    return (
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
    )
}

function tripCode(): string {
    return `TRP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`
}

@Injectable()
export class TmsTripsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly vehiclesService: VehiclesService,
    ) {}

    /** READY load plans with ≥1 line and no active trip. */
    async candidates() {
        const plans = await this.prisma.loadPlan.findMany({
            where: {
                status: LoadPlanStatus.READY,
                lines: { some: {} },
                trips: { none: { status: { not: TripStatus.CANCELLED } } },
            },
            include: loadPlanInclude,
            orderBy: { readyAt: 'asc' },
        })
        return {
            data: plans.map((plan) => {
                const { stops, errors, issues } = planTripStops(plan.lines)
                return {
                    loadPlanId: plan.id,
                    code: plan.code,
                    status: plan.status,
                    readyAt: plan.readyAt,
                    vehicle: {
                        id: plan.vehicle.id,
                        code: plan.vehicle.code,
                        plateNumber: plan.vehicle.plateNumber,
                        type: plan.vehicle.type,
                        status: plan.vehicle.status,
                        capacityQty: plan.vehicle.capacityQty,
                        routingBlocked: this.vehiclesService.isBlockedFromRouting(plan.vehicle),
                    },
                    totalQty: plan.totalQty,
                    totalWeightKg: plan.totalWeightKg,
                    totalVolumeM3: plan.totalVolumeM3,
                    lineCount: plan.lines.length,
                    shipmentCount: new Set(plan.lines.map((l) => l.shipmentLine.shipmentId)).size,
                    stopPreview: {
                        ship: stops.filter((s) => s.stopType === 'SHIP').length,
                        to: stops.filter((s) => s.stopType === 'TO').length,
                        ret: stops.filter((s) => s.stopType === 'RETURN').length,
                    },
                    /** Confirm will be blocked until these are fixed */
                    locationErrors: [...errors, ...issues.map((i) => i.message)],
                }
            }),
        }
    }

    async findAll(query: ListQuery & { vehicleId?: string }) {
        const { page, pageSize, skip } = parsePagination(query)
        const where: Prisma.TripWhereInput = { loadPlanId: { not: null } }
        if (query.vehicleId) where.vehicleId = query.vehicleId
        if (query.status) {
            const statuses = query.status.split(',').map((s) => s.trim())
            if (statuses.some((s) => !(s in TripStatus))) {
                throw new BadRequestException('Invalid trip status')
            }
            where.status = { in: statuses as TripStatus[] }
        }
        if (query.search?.trim()) {
            const q = query.search.trim()
            where.OR = [
                { code: { contains: q, mode: 'insensitive' } },
                { loadPlan: { code: { contains: q, mode: 'insensitive' } } },
                { vehicle: { plateNumber: { contains: q, mode: 'insensitive' } } },
            ]
        }
        const [data, total] = await this.prisma.$transaction([
            this.prisma.trip.findMany({
                where,
                include: tmsTripInclude,
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
            }),
            this.prisma.trip.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return assertFound(
            await this.prisma.trip.findUnique({ where: { id }, include: tmsTripInclude }),
            'Trip not found',
        )
    }

    /** Create a trip from a READY load plan; stops come only from its cargo lines. */
    async create(body: {
        loadPlanId?: unknown
        driverId?: unknown
        plannedStartAt?: unknown
        plannedEndAt?: unknown
        notes?: unknown
        /** Planner order from route preview (stop keys); only TO stops may move */
        stopOrder?: unknown
    }) {
        const loadPlanId = requireString(body.loadPlanId, 'loadPlanId')
        const driverId = optionalString(body.driverId) ?? null
        const plan = assertFound(
            await this.prisma.loadPlan.findUnique({
                where: { id: loadPlanId },
                include: loadPlanInclude,
            }),
            'Load plan not found',
        )
        if (plan.status !== LoadPlanStatus.READY) {
            throw new ConflictException(
                `Trips can only be created from READY load plans (${plan.code} is ${plan.status})`,
            )
        }
        if (plan.lines.length === 0) {
            throw new BadRequestException('Load plan has no cargo lines')
        }
        if (this.vehiclesService.isBlockedFromRouting(plan.vehicle)) {
            throw new BadRequestException('Vehicle is blocked from routing')
        }
        await this.assertVehicleFree(plan.vehicleId)
        if (driverId) await this.assertDriverUsable(driverId)
        if (
            body.stopOrder != null &&
            (!Array.isArray(body.stopOrder) || body.stopOrder.some((k) => typeof k !== 'string'))
        ) {
            throw new BadRequestException('stopOrder must be an array of stop keys')
        }
        const stopOrder = body.stopOrder as string[] | undefined

        try {
            // Resolve + validate + snapshot + status in one transaction: warehouse
            // master is re-read here, and any invalid stop rolls everything back.
            const tripId = await this.prisma.$transaction(async (tx) => {
                const fresh = assertFound(
                    await tx.loadPlan.findUnique({
                        where: { id: plan.id },
                        include: loadPlanInclude,
                    }),
                    'Load plan not found',
                )
                const planned = planTripStops(fresh.lines, stopOrder)
                if (planned.errors.length > 0) {
                    throw new BadRequestException(planned.errors.join('; '))
                }
                if (planned.issues.length > 0) {
                    throw new BadRequestException(formatStopIssues(planned.issues))
                }
                const stops = planned.stops
                const snapshotAt = new Date()

                const claimed = await tx.loadPlan.updateMany({
                    where: { id: plan.id, status: LoadPlanStatus.READY },
                    data: { status: LoadPlanStatus.ASSIGNED },
                })
                if (claimed.count === 0) {
                    throw new ConflictException(
                        'Load plan is no longer READY — reload and retry',
                    )
                }
                const trip = await tx.trip.create({
                    data: {
                        code: tripCode(),
                        vehicleId: plan.vehicleId,
                        driverId,
                        loadPlanId: plan.id,
                        status: TripStatus.PLANNED,
                        plannedStartAt: optionalDate(body.plannedStartAt) ?? null,
                        plannedEndAt: optionalDate(body.plannedEndAt) ?? null,
                        notes: optionalString(body.notes) ?? null,
                        totalQty: plan.totalQty,
                        totalWeightKg: plan.totalWeightKg,
                        totalVolumeM3: plan.totalVolumeM3,
                        stops: {
                            create: stops.map((stop) => ({
                                sequence: stop.sequence,
                                stopType: stop.stopType,
                                locationKey: stop.locationKey,
                                locationKind: stop.locationKind,
                                locationSnapshotAt: snapshotAt,
                                warehouseId: stop.warehouseId,
                                name: stop.name,
                                address: stop.address,
                                lat: stop.lat,
                                lng: stop.lng,
                                windowStart: stop.windowStart,
                                windowEnd: stop.windowEnd,
                                lines: { create: stop.lines },
                                shipments: {
                                    create: stop.shipmentIds.map((shipmentId) => ({
                                        shipmentId,
                                        action: STOP_ACTION[stop.stopType],
                                    })),
                                },
                            })),
                        },
                    },
                    select: { id: true },
                })
                return trip.id
            })
            return this.findOne(tripId)
        } catch (err) {
            if (isUniqueViolation(err)) {
                throw new ConflictException('Load plan already has an active trip')
            }
            throw err
        }
    }

    /** Reorder stops — only TO stops move; SHIP → TO → RETURN blocks are kept. */
    async reorderStops(id: string, body: { stopIds?: unknown }) {
        const trip = await this.findPlanningTrip(id)
        if (!Array.isArray(body.stopIds) || body.stopIds.some((s) => typeof s !== 'string')) {
            throw new BadRequestException('stopIds must be an array of stop ids')
        }
        const stopIds = body.stopIds as string[]
        const error = validateStopReorder(
            trip.stops.map((s) => ({ id: s.id, stopType: s.stopType })),
            stopIds,
        )
        if (error) throw new BadRequestException(error)

        await this.prisma.$transaction(async (tx) => {
            // two-phase update keeps @@unique([tripId, sequence]) satisfied
            await tx.tripStop.updateMany({
                where: { tripId: id },
                data: { sequence: { increment: 10000 } },
            })
            for (const [index, stopId] of stopIds.entries()) {
                await tx.tripStop.update({
                    where: { id: stopId },
                    data: { sequence: index + 1 },
                })
            }
            await this.backToPlanned(tx, trip)
        })
        return this.findOne(id)
    }

    /** Driver / planned window / notes. Driver or window change needs re-validation. */
    async update(
        id: string,
        body: { driverId?: unknown; plannedStartAt?: unknown; plannedEndAt?: unknown; notes?: unknown },
    ) {
        const trip = await this.findPlanningTrip(id)
        const data: Prisma.TripUpdateInput = {}
        let invalidates = false
        if (body.driverId !== undefined) {
            const driverId = optionalString(body.driverId) ?? null
            if (driverId) await this.assertDriverUsable(driverId, trip.id)
            data.driver = driverId ? { connect: { id: driverId } } : { disconnect: true }
            invalidates = invalidates || driverId !== trip.driverId
        }
        if (body.plannedStartAt !== undefined) {
            data.plannedStartAt = optionalDate(body.plannedStartAt) ?? null
            invalidates = true
        }
        if (body.plannedEndAt !== undefined) {
            data.plannedEndAt = optionalDate(body.plannedEndAt) ?? null
            invalidates = true
        }
        if (body.notes !== undefined) data.notes = optionalString(body.notes) ?? null
        if (invalidates && trip.status === TripStatus.READY) {
            data.status = TripStatus.PLANNED
        }
        await this.prisma.trip.update({ where: { id }, data })
        return this.findOne(id)
    }

    /** PLANNED → READY: driver, vehicle, capacity and cargo ↔ stop coverage checks. */
    async validate(id: string) {
        const trip = await this.findTmsTrip(id)
        if (trip.status === TripStatus.READY) return trip
        if (trip.status !== TripStatus.PLANNED) {
            throw new ConflictException(`Cannot validate a ${trip.status} trip`)
        }
        await this.assertDispatchable(trip)
        await this.transition(id, TripStatus.PLANNED, { status: TripStatus.READY })
        return this.findOne(id)
    }

    /** READY → DISPATCHED: plan locked; load plan → DISPATCHED; driver may start. */
    async dispatch(id: string) {
        const trip = await this.findTmsTrip(id)
        if (trip.status === TripStatus.DISPATCHED) return trip
        if (trip.status !== TripStatus.READY) {
            throw new ConflictException(
                `Trip must be READY (validated) before dispatch (current: ${trip.status})`,
            )
        }
        await this.assertDispatchable(trip)
        await this.prisma.$transaction(async (tx) => {
            const res = await tx.trip.updateMany({
                where: { id, status: TripStatus.READY },
                data: { status: TripStatus.DISPATCHED, dispatchedAt: new Date() },
            })
            if (res.count === 0) {
                throw new ConflictException('Trip changed concurrently — reload and retry')
            }
            await tx.loadPlan.updateMany({
                where: { id: trip.loadPlanId!, status: LoadPlanStatus.ASSIGNED },
                data: { status: LoadPlanStatus.DISPATCHED },
            })
        })
        return this.findOne(id)
    }

    /** Cancel before the driver starts; the load plan returns to READY (cargo kept). */
    async cancel(id: string) {
        const trip = await this.findTmsTrip(id)
        if (trip.status === TripStatus.CANCELLED) return trip
        const cancellable: TripStatus[] = [
            TripStatus.PLANNED,
            TripStatus.READY,
            TripStatus.DISPATCHED,
        ]
        if (!cancellable.includes(trip.status)) {
            throw new ConflictException(`Cannot cancel a ${trip.status} trip`)
        }
        await this.prisma.$transaction(async (tx) => {
            const res = await tx.trip.updateMany({
                where: { id, status: trip.status },
                data: { status: TripStatus.CANCELLED },
            })
            if (res.count === 0) {
                throw new ConflictException('Trip changed concurrently — reload and retry')
            }
            await releaseLoadPlanForTrip(tx, trip.loadPlanId)
        })
        return this.findOne(id)
    }

    // ─── internals ──────────────────────────────────────────────────────────

    private async findTmsTrip(id: string) {
        const trip = await this.findOne(id)
        if (!trip.loadPlanId) {
            throw new BadRequestException(
                'Legacy trip (no load plan) — manage it from the Trips page',
            )
        }
        return trip
    }

    private async findPlanningTrip(id: string) {
        const trip = await this.findTmsTrip(id)
        if (!PLANNING_TRIP_STATUSES.includes(trip.status)) {
            throw new ConflictException(
                `Trip is ${trip.status} — only PLANNED / READY trips can be edited`,
            )
        }
        return trip
    }

    private async backToPlanned(
        tx: Prisma.TransactionClient,
        trip: { id: string; status: TripStatus },
    ) {
        if (trip.status === TripStatus.READY) {
            await tx.trip.update({
                where: { id: trip.id },
                data: { status: TripStatus.PLANNED },
            })
        }
    }

    private async transition(
        id: string,
        from: TripStatus,
        data: Prisma.TripUpdateManyMutationInput,
    ) {
        const res = await this.prisma.trip.updateMany({ where: { id, status: from }, data })
        if (res.count === 0) {
            throw new ConflictException('Trip changed concurrently — reload and retry')
        }
    }

    private async assertVehicleFree(vehicleId: string, exceptTripId?: string) {
        const other = await this.prisma.trip.findFirst({
            where: {
                vehicleId,
                status: { in: ACTIVE_TRIP_STATUSES },
                ...(exceptTripId ? { id: { not: exceptTripId } } : {}),
            },
            select: { code: true, status: true },
        })
        if (other) {
            throw new ConflictException(
                `Vehicle already has active trip ${other.code} (${other.status})`,
            )
        }
    }

    private async assertDriverUsable(driverId: string, exceptTripId?: string) {
        const driver = assertFound(
            await this.prisma.driver.findUnique({ where: { id: driverId } }),
            'Driver not found',
        )
        if (driver.status === DriverStatus.INACTIVE) {
            throw new BadRequestException('Driver is inactive')
        }
        if (driver.licenseExpiry.getTime() < Date.now()) {
            throw new BadRequestException(
                `Driver license expired on ${driver.licenseExpiry.toISOString().slice(0, 10)}`,
            )
        }
        const other = await this.prisma.trip.findFirst({
            where: {
                driverId,
                status: { in: ACTIVE_TRIP_STATUSES },
                ...(exceptTripId ? { id: { not: exceptTripId } } : {}),
            },
            select: { code: true, status: true },
        })
        if (other) {
            throw new ConflictException(
                `Driver is already on active trip ${other.code} (${other.status})`,
            )
        }
        return driver
    }

    private async assertDispatchable(
        trip: Prisma.TripGetPayload<{ include: typeof tmsTripInclude }>,
    ) {
        if (!trip.driverId) {
            throw new BadRequestException('Assign a driver before validating the trip')
        }
        await this.assertDriverUsable(trip.driverId, trip.id)
        if (!trip.vehicle) throw new BadRequestException('Trip has no vehicle')
        if (this.vehiclesService.isBlockedFromRouting(trip.vehicle)) {
            throw new BadRequestException('Vehicle is blocked from routing')
        }
        await this.assertVehicleFree(trip.vehicle.id, trip.id)

        const plan = assertFound(
            await this.prisma.loadPlan.findUnique({
                where: { id: trip.loadPlanId! },
                include: { lines: true },
            }),
            'Load plan not found',
        )
        if (
            plan.status !== LoadPlanStatus.ASSIGNED &&
            plan.status !== LoadPlanStatus.DISPATCHED
        ) {
            throw new ConflictException(`Load plan ${plan.code} is ${plan.status}`)
        }
        const capacity = checkLoadCapacity(
            trip.vehicle,
            plan.lines.map((l) => ({ qty: l.assignedQty, weightKg: l.weightKg, volumeM3: l.volumeM3 })),
        )
        if (!capacity.ok) throw new BadRequestException(capacity.message)

        const orphanStops = trip.stops.filter((s) => s.lines.length === 0)
        if (orphanStops.length > 0) {
            throw new BadRequestException(
                `Stops without cargo lines: ${orphanStops.map((s) => s.sequence).join(', ')}`,
            )
        }
        for (const type of [TripStopType.SHIP, TripStopType.TO]) {
            const covered = new Set(
                trip.stops
                    .filter((s) => s.stopType === type)
                    .flatMap((s) => s.lines.map((l) => l.loadPlanLineId)),
            )
            const missing = plan.lines.filter((l) => !covered.has(l.id))
            if (missing.length > 0) {
                throw new BadRequestException(
                    `${missing.length} cargo line(s) have no ${type} stop — recreate the trip`,
                )
            }
        }
        const issues = await this.stopLocationIssues(trip.stops)
        if (issues.length > 0) throw new BadRequestException(formatStopIssues(issues))
    }

    /**
     * Revalidate snapshotted stop coordinates and the CURRENT warehouse master
     * state (exists, active, geocode confirmed). Snapshots are never rewritten.
     */
    async stopLocationIssues(
        stops: Prisma.TripGetPayload<{ include: typeof tmsTripInclude }>['stops'],
    ): Promise<StopCoordIssue[]> {
        const ids = [...new Set(stops.map((s) => s.warehouseId).filter((id): id is string => !!id))]
        const warehouses = ids.length
            ? await this.prisma.warehouse.findMany({
                  where: { id: { in: ids } },
                  select: warehouseGeoSelect,
              })
            : []
        const byId = new Map(warehouses.map((w) => [w.id, w]))
        return stops
            .map((s) =>
                validateStopCoordinates(
                    {
                        ...s,
                        locationKind: inferLocationKind({
                            ...s,
                            shipmentMovementTypes: s.shipments.map((l) => l.shipment.movementType),
                        }),
                    },
                    s.warehouseId ? byId.get(s.warehouseId) : null,
                ),
            )
            .filter((i): i is StopCoordIssue => i != null)
    }
}

/**
 * Trip cancelled (or deleted) before completion → load plan back to READY so
 * it is a trip candidate again. Shared with the legacy TripsService hooks.
 */
export async function releaseLoadPlanForTrip(
    tx: Prisma.TransactionClient,
    loadPlanId: string | null | undefined,
) {
    if (!loadPlanId) return
    await tx.loadPlan.updateMany({
        where: {
            id: loadPlanId,
            status: { in: [LoadPlanStatus.ASSIGNED, LoadPlanStatus.DISPATCHED] },
        },
        data: { status: LoadPlanStatus.READY },
    })
}
