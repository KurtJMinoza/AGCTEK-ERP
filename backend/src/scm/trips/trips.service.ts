import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    Logger,
    Optional,
    forwardRef,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import {
    DeliveryFailureReason,
    LoadPlanStatus,
    Prisma,
    ShipmentMovementType,
    ShipmentStatus,
    StopStatus,
    TripStatus,
    TripStopEventType,
    VehicleStatus,
    DriverStatus,
} from '@prisma/client'
import {
    assertAssignedDriver,
    isTerminalStop,
    parseDeliverOutcome,
    parseExecutionMeta,
    parseFailureReason,
    validateStopExecution,
    type ExecutionMeta,
} from './trip-execution.rules'
import { releaseLoadPlanForTrip } from '../tms/tms-trips.service'
import { PrismaService } from '../../prisma/prisma.service'
import { VehiclesService } from '../vehicles/vehicles.service'
import { MaintenanceService } from '../maintenance/maintenance.service'
import { GoodsIssueService } from '../../mm/stock-ops/goods-issue.service'
import { computeCapacity } from '../scm.capacity'
import {
    assertFound,
    optionalDate,
    optionalNumber,
    optionalString,
    parsePagination,
    pathDistanceKm,
    requireNumber,
    requireString,
    type ListQuery,
    type PaginatedResult,
} from '../scm.utils'

type StopInput = {
    sequence?: number
    name?: string
    address?: string
    lat?: number
    lng?: number
    windowStart?: string | Date
    windowEnd?: string | Date
    status?: StopStatus
    notes?: string
    /** Hex color for intermediate stop pins on the Tracking map */
    pinColor?: string | null
    shipments?: Array<{
        shipmentId?: string
        action?: string
    }>
}

type AssignLoadBody = {
    vehicleId?: string
    /** When set, append shipments to this DRAFT/PLANNED trip instead of creating a new one. */
    tripId?: string
    /** Force a brand-new trip even if the vehicle already has a planned trip. */
    forceNewTrip?: boolean
    shipmentIds?: string[]
    driverId?: string | null
    tripCode?: string
    plannedStartAt?: string | Date
    notes?: string | null
    /**
     * Step 3.5 — draft = Trip DRAFT (editable plan); approve = Trip PLANNED (ready for dispatch).
     * Shipments become ASSIGNED in both cases.
     */
    planMode?: 'draft' | 'approve'
    /** Optional delivery-stop order as destAddress keys (lowercased). Manual sequence (3.3). */
    stopOrder?: string[]
}

type CreateTripBody = {
    code?: string
    vehicleId?: string | null
    driverId?: string | null
    status?: TripStatus
    plannedStartAt?: string | Date
    notes?: string | null
    stops?: StopInput[]
    /** Dispatcher override (ERP only) — driver may execute stops out of sequence. */
    allowOutOfOrder?: boolean
}

/** Optional client metadata on driver execution calls (GPS best-effort). */
type StopExecutionBody = {
    latitude?: number
    longitude?: number
    accuracy?: number
    deviceId?: string
    clientOccurredAt?: string
    clientActionId?: string
}

type PodBody = {
    podSignatureUrl?: string | null
    podPhotoUrl?: string | null
    podNotes?: string | null
    notes?: string | null
}

type DeliverStopBody = StopExecutionBody &
    PodBody & {
        /** DELIVERED (→ stop COMPLETED) | FAILED */
        outcome?: string
        /** Required when outcome = FAILED */
        reasonCode?: string
        /** Free-text failure note (required when reasonCode = OTHER) */
        failureReason?: string | null
    }

/** Shipments that a stop outcome must not overwrite. */
const SHIPMENT_CLOSED_STATUSES: ShipmentStatus[] = [
    ShipmentStatus.DELIVERED,
    ShipmentStatus.CANCELLED,
    ShipmentStatus.EXCEPTION_HOLD,
]

function podFields(body: PodBody): Prisma.TripStopUpdateManyMutationInput {
    const field = (value: string | null | undefined) =>
        value !== undefined ? optionalString(value) ?? null : undefined
    return {
        podSignatureUrl: field(body.podSignatureUrl),
        podPhotoUrl: field(body.podPhotoUrl),
        podNotes: field(body.podNotes),
        notes: field(body.notes),
    }
}

const TRIP_STATUSES = new Set(Object.values(TripStatus))
const STOP_STATUSES = new Set(Object.values(StopStatus))

const tripInclude = {
    vehicle: true,
    driver: true,
    stops: {
        orderBy: { sequence: 'asc' as const },
        include: {
            shipments: {
                include: { shipment: true },
            },
        },
    },
} satisfies Prisma.TripInclude

@Injectable()
export class TripsService {
    private readonly logger = new Logger(TripsService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly vehiclesService: VehiclesService,
        private readonly maintenanceService: MaintenanceService,
        @Inject(forwardRef(() => GoodsIssueService))
        private readonly goodsIssueService: GoodsIssueService,
        /** Optional — used to notify SD when the trip delivers (order completion). */
        @Optional() private readonly events?: EventEmitter2,
    ) {}

    async findAll(
        query: ListQuery & { vehicleId?: string; driverId?: string },
    ): Promise<PaginatedResult<unknown>> {
        const { page, pageSize, skip } = parsePagination(query)
        const where: Prisma.TripWhereInput = {}

        if (query.vehicleId) {
            where.vehicleId = query.vehicleId
        }
        if (query.driverId) {
            where.driverId = query.driverId
        }

        if (query.status) {
            if (!TRIP_STATUSES.has(query.status as TripStatus)) {
                throw new BadRequestException('Invalid trip status')
            }
            where.status = query.status as TripStatus
        }

        if (query.search?.trim()) {
            const q = query.search.trim()
            where.OR = [
                { code: { contains: q, mode: 'insensitive' } },
                { notes: { contains: q, mode: 'insensitive' } },
            ]
        }

        const [data, total] = await this.prisma.$transaction([
            this.prisma.trip.findMany({
                where,
                include: tripInclude,
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
            }),
            this.prisma.trip.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    /**
     * Driver mobile — active trip for a driver (PLANNED / ASSIGNED / IN_TRANSIT).
     * Prefers IN_TRANSIT, then ASSIGNED, then PLANNED.
     */
    async findActiveForDriver(driverId: string) {
        const id = requireString(driverId, 'driverId')
        const activeStatuses: TripStatus[] = [
            TripStatus.IN_TRANSIT,
            TripStatus.DISPATCHED,
            TripStatus.ASSIGNED,
            TripStatus.PLANNED,
        ]

        for (const status of activeStatuses) {
            const trip = await this.prisma.trip.findFirst({
                where: {
                    driverId: id,
                    status,
                    // cargo-first trips reach the driver only once dispatched
                    ...(status === TripStatus.PLANNED ? { loadPlanId: null } : {}),
                },
                include: tripInclude,
                orderBy: { updatedAt: 'desc' },
            })
            if (trip) return trip
        }

        return null
    }

    /**
     * Driver 5.1 — start route → IN_TRANSIT.
     * Cargo-first trips: DISPATCHED only. Legacy trips: PLANNED / ASSIGNED.
     */
    async startTrip(id: string, callerDriverId?: string | null) {
        const trip = await this.findOne(id)
        assertAssignedDriver(trip, callerDriverId)
        if (trip.status === TripStatus.IN_TRANSIT) return trip
        const startable: TripStatus[] = trip.loadPlanId
            ? [TripStatus.DISPATCHED]
            : [TripStatus.ASSIGNED, TripStatus.PLANNED, TripStatus.DISPATCHED]
        if (!startable.includes(trip.status)) {
            throw new BadRequestException(
                trip.loadPlanId
                    ? `Trip must be dispatched before it can start (current: ${trip.status})`
                    : `Cannot start trip from status ${trip.status}`,
            )
        }
        return this.updateStatus(id, TripStatus.IN_TRANSIT)
    }

    /** Driver 5.5 — PENDING → ARRIVED (trip must be IN_TRANSIT, stops in order). */
    async arriveStop(
        tripId: string,
        stopId: string,
        callerDriverId: string | null | undefined,
        body: StopExecutionBody = {},
    ) {
        const trip = await this.findOne(tripId)
        assertAssignedDriver(trip, callerDriverId)
        const meta = parseExecutionMeta(body)
        if (await this.isReplay(meta.clientActionId, stopId, TripStopEventType.ARRIVED)) {
            return trip
        }
        validateStopExecution({ trip, stopId, action: 'ARRIVE', callerDriverId })

        await this.runStopTransition(async (tx) => {
            await this.transitionStop(tx, stopId, StopStatus.PENDING, {
                status: StopStatus.ARRIVED,
                arrivedAt: new Date(),
            })
            await this.recordStopEvent(tx, {
                tripId,
                stopId,
                eventType: TripStopEventType.ARRIVED,
                driverId: trip.driverId,
                meta,
            })
        })
        return this.findOne(tripId)
    }

    /** Driver 6.x — save draft POD fields while the stop is ARRIVED. */
    async saveStopPod(
        tripId: string,
        stopId: string,
        body: PodBody,
        callerDriverId?: string | null,
    ) {
        const trip = await this.findOne(tripId)
        validateStopExecution({ trip, stopId, action: 'POD', callerDriverId })

        await this.transitionStop(this.prisma, stopId, StopStatus.ARRIVED, podFields(body))
        return this.findOne(tripId)
    }

    /**
     * Driver 6.x — ARRIVED → COMPLETED (outcome DELIVERED) or FAILED (reasonCode required).
     * Stop update, audit event and linked-shipment side effects commit together.
     * A failed stop does not end the trip; the trip auto-completes once every stop is terminal.
     */
    async deliverStop(
        tripId: string,
        stopId: string,
        body: DeliverStopBody,
        callerDriverId?: string | null,
    ) {
        const trip = await this.findOne(tripId)
        assertAssignedDriver(trip, callerDriverId)
        const outcome = parseDeliverOutcome(body.outcome)
        const meta = parseExecutionMeta(body)
        const eventType =
            outcome === 'FAIL' ? TripStopEventType.FAILED : TripStopEventType.COMPLETED
        const failureCode = outcome === 'FAIL' ? parseFailureReason(body.reasonCode) : null
        const failureNote = optionalString(body.failureReason) ?? null
        if (failureCode === DeliveryFailureReason.OTHER && !failureNote) {
            throw new BadRequestException('Describe the failure (failureReason) when reasonCode is OTHER')
        }
        if (await this.isReplay(meta.clientActionId, stopId, eventType)) return trip

        const stop = validateStopExecution({
            trip,
            stopId,
            action: outcome === 'FAIL' ? 'FAIL' : 'COMPLETE',
            callerDriverId,
        })
        const now = new Date()

        await this.runStopTransition(async (tx) => {
            if (outcome === 'FAIL') {
                await this.transitionStop(tx, stopId, StopStatus.ARRIVED, {
                    ...podFields(body),
                    status: StopStatus.FAILED,
                    failedAt: now,
                    failureCode,
                    failureReason: failureNote,
                })
                await this.handleDeliveryFailure(tx, stop.shipments, {
                    code: failureCode!,
                    note: failureNote,
                    at: now,
                })
            } else {
                await this.transitionStop(tx, stopId, StopStatus.ARRIVED, {
                    ...podFields(body),
                    status: StopStatus.COMPLETED,
                    completedAt: now,
                })
                await this.settleDeliveredShipments(tx, stop.shipments, body, now)
            }
            await this.recordStopEvent(tx, {
                tripId,
                stopId,
                eventType,
                driverId: trip.driverId,
                meta,
                reasonCode: failureCode,
                notes:
                    outcome === 'FAIL'
                        ? failureNote
                        : optionalString(body.podNotes) ?? optionalString(body.notes) ?? null,
            })
        })

        const refreshed = await this.findOne(tripId)
        const remaining = refreshed.stops.filter((s) => !isTerminalStop(s.status))
        if (remaining.length === 0 && refreshed.status === TripStatus.IN_TRANSIT) {
            return this.updateStatus(tripId, TripStatus.COMPLETED)
        }
        return refreshed
    }

    /** DROPOFF shipments at a completed stop → DELIVERED (shipments on exception hold stay held). */
    private async settleDeliveredShipments(
        tx: Prisma.TransactionClient,
        links: Array<{ action: string; shipmentId: string }>,
        body: DeliverStopBody,
        now: Date,
    ) {
        const dropoffIds = links.filter((l) => l.action === 'DROPOFF').map((l) => l.shipmentId)
        if (dropoffIds.length === 0) return
        const data: Prisma.ShipmentUpdateManyMutationInput = {
            status: ShipmentStatus.DELIVERED,
            deliveredAt: now,
        }
        const sig = optionalString(body.podSignatureUrl)
        const photo = optionalString(body.podPhotoUrl)
        const note = optionalString(body.podNotes) ?? optionalString(body.notes)
        if (sig) data.podSignatureUrl = sig
        if (photo) data.podPhotoUrl = photo
        if (note) data.notes = note
        await tx.shipment.updateMany({
            where: { id: { in: dropoffIds }, status: { notIn: SHIPMENT_CLOSED_STATUSES } },
            data,
        })
    }

    /**
     * Failed stop → linked PICKUP/DROPOFF shipments go to EXCEPTION_HOLD with the reason.
     * Fulfilment only — no inventory posting (goods remain issued to the trip; returns are a dispatcher decision).
     */
    private async handleDeliveryFailure(
        tx: Prisma.TransactionClient,
        links: Array<{ action: string; shipmentId: string }>,
        failure: { code: DeliveryFailureReason; note: string | null; at: Date },
    ) {
        const ids = [
            ...new Set(
                links
                    .filter((l) => l.action === 'PICKUP' || l.action === 'DROPOFF')
                    .map((l) => l.shipmentId),
            ),
        ]
        if (ids.length === 0) return
        const { count } = await tx.shipment.updateMany({
            where: { id: { in: ids }, status: { notIn: SHIPMENT_CLOSED_STATUSES } },
            data: {
                status: ShipmentStatus.EXCEPTION_HOLD,
                exceptionCode: failure.code,
                exceptionNote: failure.note,
                exceptionAt: failure.at,
            },
        })
        this.logger.log(`Delivery failure ${failure.code}: ${count} shipment(s) on EXCEPTION_HOLD`)
    }

    /** Conditional status write — fails if another request moved the stop first. */
    private async transitionStop(
        client: Prisma.TransactionClient | PrismaService,
        stopId: string,
        expected: StopStatus,
        data: Prisma.TripStopUpdateManyMutationInput,
    ) {
        const { count } = await client.tripStop.updateMany({
            where: { id: stopId, status: expected },
            data,
        })
        if (count !== 1) {
            throw new ConflictException('Stop was updated by another request — refresh and retry')
        }
    }

    private async recordStopEvent(
        tx: Prisma.TransactionClient,
        input: {
            tripId: string
            stopId: string
            eventType: TripStopEventType
            driverId: string | null
            meta: ExecutionMeta
            reasonCode?: DeliveryFailureReason | null
            notes?: string | null
        },
    ) {
        const { meta } = input
        await tx.tripStopEvent.create({
            data: {
                tripId: input.tripId,
                stopId: input.stopId,
                eventType: input.eventType,
                occurredAt: meta.occurredAt,
                driverId: input.driverId,
                latitude: meta.latitude,
                longitude: meta.longitude,
                accuracyM: meta.accuracyM,
                deviceId: meta.deviceId,
                reasonCode: input.reasonCode ?? null,
                notes: input.notes ?? null,
                clientActionId: meta.clientActionId,
            },
        })
    }

    /**
     * Idempotency: a clientActionId already recorded for the same stop + event is a no-op replay.
     * Reusing it for a different action is a conflict.
     */
    private async isReplay(
        clientActionId: string | null,
        stopId: string,
        eventType: TripStopEventType,
    ) {
        if (!clientActionId) return false
        const existing = await this.prisma.tripStopEvent.findUnique({
            where: { clientActionId },
            select: { stopId: true, eventType: true },
        })
        if (!existing) return false
        if (existing.stopId === stopId && existing.eventType === eventType) return true
        throw new ConflictException('clientActionId was already used for a different stop action')
    }

    /** Runs a stop transition; a concurrent replay racing on clientActionId surfaces as a conflict. */
    private async runStopTransition(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
        try {
            await this.prisma.$transaction(fn)
        } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                throw new ConflictException('This stop action was already recorded')
            }
            throw err
        }
    }

    async findOne(id: string) {
        return assertFound(
            await this.prisma.trip.findUnique({
                where: { id },
                include: tripInclude,
            }),
            'Trip not found',
        )
    }

    private async assertVehicleAssignable(vehicleId: string | null | undefined) {
        if (!vehicleId) return
        const vehicle = await this.vehiclesService.findOne(vehicleId)
        if (this.vehiclesService.isBlockedFromRouting(vehicle)) {
            throw new BadRequestException(
                'Vehicle is blocked from routing (maintenance or inactive status)',
            )
        }
    }

    private async assertDriverExists(driverId: string | null | undefined) {
        if (!driverId) return
        assertFound(
            await this.prisma.driver.findUnique({ where: { id: driverId } }),
            'Driver not found',
        )
    }

    private buildStopCreates(stops: StopInput[] | undefined) {
        if (!stops?.length) return undefined

        return {
            create: stops.map((stop, index) => {
                const sequence =
                    stop.sequence != null
                        ? requireNumber(stop.sequence, 'sequence')
                        : index + 1
                const status = stop.status ?? StopStatus.PENDING
                if (!STOP_STATUSES.has(status)) {
                    throw new BadRequestException('Invalid stop status')
                }

                return {
                    sequence,
                    name: optionalString(stop.name),
                    address: requireString(stop.address, 'address'),
                    lat: optionalNumber(stop.lat),
                    lng: optionalNumber(stop.lng),
                    windowStart: optionalDate(stop.windowStart),
                    windowEnd: optionalDate(stop.windowEnd),
                    status,
                    notes: optionalString(stop.notes),
                    pinColor: optionalString(stop.pinColor) ?? null,
                    shipments: stop.shipments?.length
                        ? {
                              create: stop.shipments.map((link) => {
                                  const action = requireString(
                                      link.action,
                                      'action',
                                  ).toUpperCase()
                                  if (action !== 'PICKUP' && action !== 'DROPOFF') {
                                      throw new BadRequestException(
                                          'action must be PICKUP or DROPOFF',
                                      )
                                  }
                                  return {
                                      action,
                                      shipment: {
                                          connect: {
                                              id: requireString(
                                                  link.shipmentId,
                                                  'shipmentId',
                                              ),
                                          },
                                      },
                                  }
                              }),
                          }
                        : undefined,
                }
            }),
        }
    }

    /**
     * @deprecated Creating trips with shipment stops directly bypasses load building.
     * Use POST /scm/tms/load-plans → READY → POST /scm/tms/trips.
     */
    async create(body: CreateTripBody) {
        if (body.stops?.some((stop) => stop.shipments?.length)) {
            this.logger.warn(
                'Deprecated: POST /scm/trips with shipment stops — use /scm/tms (cargo-first)',
            )
        }
        const status = body.status ?? TripStatus.DRAFT
        if (!TRIP_STATUSES.has(status)) {
            throw new BadRequestException('Invalid trip status')
        }

        await this.assertVehicleAssignable(body.vehicleId)
        await this.assertDriverExists(body.driverId)

        const code =
            optionalString(body.code) ??
            `TRP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random()
                .toString(36)
                .slice(2, 6)
                .toUpperCase()}`

        const shipmentIds = [
            ...new Set(
                (body.stops ?? []).flatMap((stop) =>
                    (stop.shipments ?? [])
                        .map((link) =>
                            typeof link.shipmentId === 'string'
                                ? link.shipmentId.trim()
                                : '',
                        )
                        .filter(Boolean),
                ),
            ),
        ]

        let totalQty: number | undefined
        if (shipmentIds.length > 0) {
            const shipments = await this.prisma.shipment.findMany({
                where: { id: { in: shipmentIds } },
            })
            if (shipments.length !== shipmentIds.length) {
                throw new BadRequestException(
                    'One or more shipments were not found',
                )
            }
            const notReady = shipments.filter(
                (shipment) => shipment.status !== ShipmentStatus.READY,
            )
            if (notReady.length > 0) {
                throw new BadRequestException(
                    `Only READY shipments can be planned (${notReady.map((s) => s.reference).join(', ')})`,
                )
            }
            await this.assertNotOnLoadPlan(shipmentIds)

            const alreadyLinked = await this.prisma.tripStopShipment.findFirst({
                where: {
                    shipmentId: { in: shipmentIds },
                    tripStop: {
                        trip: {
                            status: {
                                notIn: [
                                    TripStatus.COMPLETED,
                                    TripStatus.CANCELLED,
                                ],
                            },
                        },
                    },
                },
                include: {
                    shipment: { select: { reference: true } },
                    tripStop: { select: { trip: { select: { code: true } } } },
                },
            })
            if (alreadyLinked) {
                throw new BadRequestException(
                    `Shipment ${alreadyLinked.shipment.reference} is already on trip ${alreadyLinked.tripStop.trip.code}`,
                )
            }

            if (body.vehicleId) {
                const vehicle = await this.vehiclesService.findOne(body.vehicleId)
                const capacity = computeCapacity(vehicle, shipments)
                if (!capacity.canFit) {
                    throw new BadRequestException(
                        capacity.message ?? 'Load exceeds vehicle capacity',
                    )
                }
                totalQty = capacity.loadedQty
            } else {
                totalQty = shipments.reduce(
                    (sum, shipment) => sum + (shipment.quantity ?? 0),
                    0,
                )
            }
        }

        return this.prisma.$transaction(async (tx) => {
            const trip = await tx.trip.create({
                data: {
                    code,
                    vehicleId: body.vehicleId || null,
                    driverId: body.driverId || null,
                    status,
                    plannedStartAt: optionalDate(body.plannedStartAt),
                    notes: optionalString(body.notes) ?? null,
                    totalQty: totalQty ?? null,
                    stops: this.buildStopCreates(body.stops),
                },
                include: tripInclude,
            })

            if (shipmentIds.length > 0) {
                await tx.shipment.updateMany({
                    where: { id: { in: shipmentIds } },
                    data: { status: ShipmentStatus.ASSIGNED },
                })
            }

            return trip
        })
    }

    async update(id: string, body: CreateTripBody) {
        const existing = await this.findOne(id)
        if (existing.loadPlanId) {
            if (body.vehicleId !== undefined && body.vehicleId !== existing.vehicleId) {
                throw new BadRequestException(
                    'Vehicle is fixed by the load plan on cargo-first trips',
                )
            }
            if (body.status !== undefined && body.status !== existing.status) {
                this.assertCargoFirstStatusChange(existing.status, body.status)
            }
        }

        if (body.vehicleId !== undefined) {
            await this.assertVehicleAssignable(body.vehicleId)
        }
        if (body.driverId !== undefined) {
            await this.assertDriverExists(body.driverId)
        }

        const data: Prisma.TripUpdateInput = {}

        if (body.code !== undefined) data.code = requireString(body.code, 'code')
        if (body.vehicleId !== undefined) {
            data.vehicle = body.vehicleId
                ? { connect: { id: body.vehicleId } }
                : { disconnect: true }
        }
        if (body.driverId !== undefined) {
            data.driver = body.driverId
                ? { connect: { id: body.driverId } }
                : { disconnect: true }
        }
        if (body.status !== undefined) {
            if (!TRIP_STATUSES.has(body.status)) {
                throw new BadRequestException('Invalid trip status')
            }
            data.status = body.status
        }
        if (body.plannedStartAt !== undefined) {
            data.plannedStartAt = optionalDate(body.plannedStartAt) ?? null
        }
        if (body.notes !== undefined) {
            data.notes = optionalString(body.notes) ?? null
        }
        if (body.allowOutOfOrder !== undefined) {
            if (typeof body.allowOutOfOrder !== 'boolean') {
                throw new BadRequestException('allowOutOfOrder must be a boolean')
            }
            data.allowOutOfOrder = body.allowOutOfOrder
        }

        return this.prisma.trip.update({
            where: { id },
            data,
            include: tripInclude,
        })
    }

    async updateStatus(id: string, status: TripStatus) {
        if (!TRIP_STATUSES.has(status)) {
            throw new BadRequestException('Invalid trip status')
        }

        const trip = await this.findOne(id)
        const completing =
            status === TripStatus.COMPLETED &&
            trip.status !== TripStatus.COMPLETED

        if (trip.loadPlanId && status !== trip.status) {
            this.assertCargoFirstStatusChange(trip.status, status)
        }

        if (
            (status === TripStatus.PLANNED ||
                status === TripStatus.ASSIGNED ||
                status === TripStatus.IN_TRANSIT) &&
            trip.vehicleId
        ) {
            await this.assertVehicleAssignable(trip.vehicleId)
        }

        if (status === TripStatus.ASSIGNED && !trip.vehicleId) {
            throw new BadRequestException(
                'Assign a vehicle before dispatching (Phase 3.2)',
            )
        }

        if (status === TripStatus.IN_TRANSIT) {
            if (!trip.vehicleId) {
                throw new BadRequestException(
                    'Cannot start trip without a vehicle',
                )
            }
            await this.assertVehicleAssignable(trip.vehicleId)
            // GI before status flip — block start if stock issue fails
            await this.issueGoodsForTripShipments(trip)
        }

        const data: Prisma.TripUpdateInput = { status }

        // Phase 3.3 — actual start (startedAt)
        if (status === TripStatus.IN_TRANSIT && !trip.startedAt) {
            data.startedAt = new Date()
        }
        if (completing) {
            data.completedAt = trip.completedAt ?? new Date()
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.trip.update({ where: { id }, data })
            if (trip.loadPlanId && completing) {
                await tx.loadPlan.updateMany({
                    where: { id: trip.loadPlanId },
                    data: { status: LoadPlanStatus.COMPLETED },
                })
            }
            if (trip.loadPlanId && status === TripStatus.CANCELLED) {
                await releaseLoadPlanForTrip(tx, trip.loadPlanId)
            }
        })

        const shipmentIds = [
            ...new Set(
                (trip.stops ?? []).flatMap((stop) =>
                    (stop.shipments ?? []).map((link) => link.shipmentId),
                ),
            ),
        ]

        if (status === TripStatus.IN_TRANSIT && shipmentIds.length > 0) {
            await this.prisma.shipment.updateMany({
                where: { id: { in: shipmentIds } },
                data: { status: ShipmentStatus.IN_TRANSIT },
            })
            if (trip.vehicleId) {
                await this.prisma.vehicle.update({
                    where: { id: trip.vehicleId },
                    data: { status: VehicleStatus.IN_TRANSIT },
                })
            }
        }

        if (status === TripStatus.IN_TRANSIT && trip.driverId) {
            await this.prisma.driver.update({
                where: { id: trip.driverId },
                data: { status: DriverStatus.ON_TRIP },
            })
        }

        if (completing && shipmentIds.length > 0) {
            await this.prisma.shipment.updateMany({
                where: {
                    id: { in: shipmentIds },
                    status: { notIn: SHIPMENT_CLOSED_STATUSES },
                },
                data: { status: ShipmentStatus.DELIVERED, deliveredAt: new Date() },
            })
            // SD marks the linked sales orders delivered and finalizes invoices.
            this.events?.emit('shipment.delivered', { shipmentIds })
            if (trip.vehicleId) {
                await this.prisma.vehicle.update({
                    where: { id: trip.vehicleId },
                    data: { status: VehicleStatus.AVAILABLE },
                })
            }
            if (trip.driverId) {
                await this.prisma.driver.update({
                    where: { id: trip.driverId },
                    data: { status: DriverStatus.AVAILABLE },
                })
            }
        }

        if (completing && trip.vehicleId) {
            await this.finalizeTripOdometer(trip.id, trip.vehicleId)
        }

        return this.findOne(id)
    }

    /**
     * Cargo-first trips move through /scm/tms (validate, dispatch, cancel);
     * the generic status endpoint only drives execution (start / complete / cancel).
     */
    private assertCargoFirstStatusChange(from: TripStatus, to: TripStatus) {
        const allowed =
            (to === TripStatus.IN_TRANSIT && from === TripStatus.DISPATCHED) ||
            (to === TripStatus.COMPLETED && from === TripStatus.IN_TRANSIT) ||
            (to === TripStatus.CANCELLED &&
                (from === TripStatus.PLANNED ||
                    from === TripStatus.READY ||
                    from === TripStatus.DISPATCHED))
        if (!allowed) {
            throw new BadRequestException(
                `Cargo-first trip cannot go ${from} → ${to} here — use Trip Planning (/scm/tms/trips)`,
            )
        }
    }

    private async assertNotOnLoadPlan(shipmentIds: string[]) {
        const loaded = await this.prisma.loadPlanLine.findFirst({
            where: { shipmentLine: { shipmentId: { in: shipmentIds } } },
            select: {
                loadPlan: { select: { code: true } },
                shipmentLine: { select: { shipment: { select: { reference: true } } } },
            },
        })
        if (loaded) {
            throw new BadRequestException(
                `Shipment ${loaded.shipmentLine.shipment.reference} has cargo on load plan ${loaded.loadPlan.code}`,
            )
        }
    }

    private assertNotCargoFirst(trip: { loadPlanId: string | null }, action: string) {
        if (trip.loadPlanId) {
            throw new BadRequestException(
                `Cannot ${action} on a cargo-first trip — stops are derived from its load plan`,
            )
        }
    }

    /**
     * Persist last recorded odometer after a trip.
     * GPS pings already advance the running odometer; if the trip had no GPS,
     * estimate distance from stop-to-stop coordinates.
     */
    private async finalizeTripOdometer(tripId: string, vehicleId: string) {
        const gpsCount = await this.prisma.gpsLog.count({ where: { tripId } })

        if (gpsCount === 0) {
            const stops = await this.prisma.tripStop.findMany({
                where: { tripId },
                orderBy: { sequence: 'asc' },
                select: { lat: true, lng: true },
            })
            const estimatedKm = pathDistanceKm(stops)
            if (estimatedKm > 0) {
                await this.prisma.vehicle.update({
                    where: { id: vehicleId },
                    data: { odometerKm: { increment: estimatedKm } },
                })
            }
        }

        await this.maintenanceService.ensureOdometerMaintenanceDue(vehicleId)
    }

    async addStop(tripId: string, body: StopInput) {
        this.assertNotCargoFirst(await this.findOne(tripId), 'add stops')

        const sequence =
            body.sequence != null
                ? requireNumber(body.sequence, 'sequence')
                : ((
                      await this.prisma.tripStop.aggregate({
                          where: { tripId },
                          _max: { sequence: true },
                      })
                  )._max.sequence ?? 0) + 1

        const status = body.status ?? StopStatus.PENDING
        if (!STOP_STATUSES.has(status)) {
            throw new BadRequestException('Invalid stop status')
        }

        await this.prisma.tripStop.create({
            data: {
                tripId,
                sequence,
                name: optionalString(body.name),
                address: requireString(body.address, 'address'),
                lat: optionalNumber(body.lat),
                lng: optionalNumber(body.lng),
                windowStart: optionalDate(body.windowStart),
                windowEnd: optionalDate(body.windowEnd),
                status,
                notes: optionalString(body.notes),
                pinColor: optionalString(body.pinColor) ?? null,
                shipments: body.shipments?.length
                    ? {
                          create: body.shipments.map((link) => {
                              const action = requireString(
                                  link.action,
                                  'action',
                              ).toUpperCase()
                              if (action !== 'PICKUP' && action !== 'DROPOFF') {
                                  throw new BadRequestException(
                                      'action must be PICKUP or DROPOFF',
                                  )
                              }
                              return {
                                  action,
                                  shipmentId: requireString(
                                      link.shipmentId,
                                      'shipmentId',
                                  ),
                              }
                          }),
                      }
                    : undefined,
            },
        })

        return this.findOne(tripId)
    }

    async updateStop(tripId: string, stopId: string, body: StopInput) {
        await this.findOne(tripId)
        const stop = assertFound(
            await this.prisma.tripStop.findFirst({
                where: { id: stopId, tripId },
            }),
            'Stop not found',
        )

        const data: Prisma.TripStopUpdateInput = {}

        if (body.sequence !== undefined) {
            data.sequence = requireNumber(body.sequence, 'sequence')
        }
        if (body.name !== undefined) data.name = optionalString(body.name) ?? null
        if (body.address !== undefined) {
            data.address = requireString(body.address, 'address')
        }
        if (body.lat !== undefined) data.lat = optionalNumber(body.lat) ?? null
        if (body.lng !== undefined) data.lng = optionalNumber(body.lng) ?? null
        if (body.windowStart !== undefined) {
            data.windowStart = optionalDate(body.windowStart) ?? null
        }
        if (body.windowEnd !== undefined) {
            data.windowEnd = optionalDate(body.windowEnd) ?? null
        }
        if (body.status !== undefined && body.status !== stop.status) {
            if (!STOP_STATUSES.has(body.status)) {
                throw new BadRequestException('Invalid stop status')
            }
            if (
                body.status === StopStatus.ARRIVED ||
                body.status === StopStatus.COMPLETED ||
                body.status === StopStatus.FAILED
            ) {
                throw new BadRequestException(
                    `Stop execution (${body.status}) goes through the driver arrive / deliver endpoints`,
                )
            }
            if (isTerminalStop(stop.status)) {
                throw new ConflictException(
                    `Stop #${stop.sequence} is ${stop.status} and cannot be changed`,
                )
            }
            data.status = body.status
        }
        if (body.notes !== undefined) {
            data.notes = optionalString(body.notes) ?? null
        }
        if (body.pinColor !== undefined) {
            data.pinColor = optionalString(body.pinColor) ?? null
        }

        await this.prisma.tripStop.update({ where: { id: stopId }, data })
        return this.findOne(tripId)
    }

    async removeStop(tripId: string, stopId: string) {
        this.assertNotCargoFirst(await this.findOne(tripId), 'remove stops')
        assertFound(
            await this.prisma.tripStop.findFirst({
                where: { id: stopId, tripId },
            }),
            'Stop not found',
        )
        await this.prisma.tripStop.delete({ where: { id: stopId } })
        return this.findOne(tripId)
    }

    async remove(id: string) {
        const trip = await this.findOne(id)
        if (
            trip.loadPlanId &&
            trip.status !== TripStatus.PLANNED &&
            trip.status !== TripStatus.READY &&
            trip.status !== TripStatus.CANCELLED
        ) {
            throw new BadRequestException(
                `Cannot delete a ${trip.status} cargo-first trip`,
            )
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.trip.delete({ where: { id } })
            if (trip.status !== TripStatus.CANCELLED) {
                await releaseLoadPlanForTrip(tx, trip.loadPlanId)
            }
        })
        return { ok: true }
    }

    /**
     * Build or fill a planned trip from READY shipments + a routing-eligible vehicle.
     * Reuses an existing DRAFT/PLANNED trip for the vehicle when tripId is set,
     * or when one already exists (unless forceNewTrip).
     * Re-validates item quantity vs vehicle.capacityQty server-side.
     *
     * @deprecated Replaced by cargo-first load building (POST /scm/tms/load-plans/:id/lines).
     */
    async assignLoad(body: AssignLoadBody) {
        this.logger.warn(
            'Deprecated: POST /scm/trips/assign-load — use /scm/tms/load-plans (cargo-first)',
        )
        const vehicleId = requireString(body.vehicleId, 'vehicleId')
        const shipmentIds = Array.isArray(body.shipmentIds)
            ? [
                  ...new Set(
                      body.shipmentIds.filter(
                          (id) => typeof id === 'string' && id.trim(),
                      ),
                  ),
              ]
            : []

        if (shipmentIds.length === 0) {
            throw new BadRequestException('Select at least one shipment')
        }

        const vehicle = await this.vehiclesService.findOne(vehicleId)
        if (vehicle.status !== VehicleStatus.AVAILABLE) {
            throw new BadRequestException(
                'Vehicle must be AVAILABLE to assign a load',
            )
        }
        if (this.vehiclesService.isBlockedFromRouting(vehicle)) {
            throw new BadRequestException(
                'Vehicle is blocked from routing (maintenance or inactive status)',
            )
        }

        const shipments = await this.prisma.shipment.findMany({
            where: { id: { in: shipmentIds } },
        })

        if (shipments.length !== shipmentIds.length) {
            throw new BadRequestException('One or more shipments were not found')
        }

        const notReady = shipments.filter(
            (shipment) => shipment.status !== ShipmentStatus.READY,
        )
        if (notReady.length > 0) {
            throw new BadRequestException(
                `Only READY shipments can be assigned (${notReady.map((s) => s.reference).join(', ')})`,
            )
        }
        await this.assertNotOnLoadPlan(shipmentIds)

        const alreadyLinked = await this.prisma.tripStopShipment.findFirst({
            where: {
                shipmentId: { in: shipmentIds },
                tripStop: {
                    trip: {
                        status: {
                            notIn: [TripStatus.COMPLETED, TripStatus.CANCELLED],
                        },
                    },
                },
            },
            include: {
                shipment: { select: { reference: true } },
                tripStop: { select: { trip: { select: { code: true } } } },
            },
        })
        if (alreadyLinked) {
            throw new BadRequestException(
                `Shipment ${alreadyLinked.shipment.reference} is already on trip ${alreadyLinked.tripStop.trip.code}`,
            )
        }

        await this.assertDriverExists(body.driverId)

        const forceNew = body.forceNewTrip === true
        let targetTripId = optionalString(body.tripId) ?? null

        if (!forceNew && !targetTripId) {
            const openTrip = await this.prisma.trip.findFirst({
                where: {
                    vehicleId,
                    status: {
                        in: [
                            TripStatus.DRAFT,
                            TripStatus.PLANNED,
                            TripStatus.ASSIGNED,
                        ],
                    },
                },
                orderBy: [{ updatedAt: 'desc' }],
                select: { id: true },
            })
            targetTripId = openTrip?.id ?? null
        }

        if (targetTripId) {
            return this.appendShipmentsToTrip({
                tripId: targetTripId,
                vehicleId,
                shipments,
                driverId: body.driverId,
                plannedStartAt: body.plannedStartAt,
                notes: body.notes,
                planMode: body.planMode === 'approve' ? 'approve' : 'draft',
                stopOrder: Array.isArray(body.stopOrder)
                    ? body.stopOrder.filter(
                          (item): item is string => typeof item === 'string',
                      )
                    : undefined,
            })
        }

        const capacity = computeCapacity(vehicle, shipments)
        if (!capacity.canFit) {
            throw new BadRequestException(
                capacity.message ?? 'Load exceeds vehicle capacity',
            )
        }

        const tripCode =
            optionalString(body.tripCode) ??
            `TRP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random()
                .toString(36)
                .slice(2, 6)
                .toUpperCase()}`

        // Step 3.5: draft → DRAFT plan; approve → PLANNED (ready for Step 4 dispatch)
        const planMode = body.planMode === 'approve' ? 'approve' : 'draft'
        const tripStatus =
            planMode === 'approve' ? TripStatus.PLANNED : TripStatus.DRAFT

        const stopOrder = Array.isArray(body.stopOrder)
            ? body.stopOrder.filter(
                  (item): item is string => typeof item === 'string',
              )
            : undefined

        const stops = this.buildAssignStops(shipments, stopOrder)

        return this.prisma.$transaction(async (tx) => {
            const trip = await tx.trip.create({
                data: {
                    code: tripCode,
                    vehicleId,
                    driverId: body.driverId || null,
                    status: tripStatus,
                    plannedStartAt: optionalDate(body.plannedStartAt) ?? null,
                    notes: optionalString(body.notes) ?? null,
                    totalQty: capacity.loadedQty,
                    stops: { create: stops },
                },
                include: tripInclude,
            })

            await tx.shipment.updateMany({
                where: { id: { in: shipmentIds } },
                data: { status: ShipmentStatus.ASSIGNED },
            })

            return trip
        })
    }

    private buildAssignStops(
        shipments: Array<{
            id: string
            customerName: string | null
            originAddress: string | null
            originLat: number | null
            originLng: number | null
            destAddress: string
            destLat: number | null
            destLng: number | null
            earliestDeliveryAt: Date | null
            latestDeliveryAt: Date | null
            movementType?: ShipmentMovementType | null
        }>,
        stopOrder?: string[],
    ): Prisma.TripStopCreateWithoutTripInput[] {
        const origin = shipments[0]
        const destGroups = new Map<string, typeof shipments>()
        for (const shipment of shipments) {
            const key = shipment.destAddress.trim().toLowerCase()
            const group = destGroups.get(key) ?? []
            group.push(shipment)
            destGroups.set(key, group)
        }

        const normalizedOrder = (stopOrder ?? []).map((key) =>
            key.trim().toLowerCase(),
        )
        const orderedKeys =
            normalizedOrder.length > 0
                ? [
                      ...normalizedOrder.filter((key) => destGroups.has(key)),
                      ...[...destGroups.keys()].filter(
                          (key) => !normalizedOrder.includes(key),
                      ),
                  ]
                : [...destGroups.keys()]

        const stops: Prisma.TripStopCreateWithoutTripInput[] = []
        const originAddress = origin.originAddress?.trim() ?? ''
        let sequence = 1

        if (originAddress) {
            const pickupCustomer =
                shipments.every(
                    (s) => s.movementType === ShipmentMovementType.PICKUP,
                ) && origin.customerName
                    ? origin.customerName
                    : null
            stops.push({
                sequence,
                name: pickupCustomer
                    ? `Pickup · ${pickupCustomer}`
                    : 'Pickup',
                address: originAddress,
                lat: origin.originLat,
                lng: origin.originLng,
                status: StopStatus.PENDING,
                shipments: {
                    create: shipments.map((shipment) => ({
                        action: 'PICKUP',
                        shipmentId: shipment.id,
                    })),
                },
            })
            sequence += 1
        }

        for (const key of orderedKeys) {
            const group = destGroups.get(key)
            if (!group?.length) continue
            const dest = group[0]
            const allPickup = group.every(
                (s) => s.movementType === ShipmentMovementType.PICKUP,
            )
            const windowStarts = group
                .map((s) => s.earliestDeliveryAt)
                .filter((d): d is Date => d != null)
            const windowEnds = group
                .map((s) => s.latestDeliveryAt)
                .filter((d): d is Date => d != null)
            stops.push({
                sequence,
                name: allPickup
                    ? dest.customerName
                        ? `Return · ${dest.customerName}`
                        : 'Return to hub'
                    : dest.customerName
                      ? `Deliver · ${dest.customerName}`
                      : 'Deliver',
                address: dest.destAddress,
                lat: dest.destLat,
                lng: dest.destLng,
                windowStart:
                    windowStarts.length > 0
                        ? new Date(
                              Math.min(...windowStarts.map((d) => d.getTime())),
                          )
                        : null,
                windowEnd:
                    windowEnds.length > 0
                        ? new Date(
                              Math.max(...windowEnds.map((d) => d.getTime())),
                          )
                        : null,
                status: StopStatus.PENDING,
                shipments: {
                    create: group.map((shipment) => ({
                        action: 'DROPOFF',
                        shipmentId: shipment.id,
                    })),
                },
            })
            sequence += 1
        }

        return stops
    }

    private async appendShipmentsToTrip(input: {
        tripId: string
        vehicleId: string
        shipments: Array<{
            id: string
            quantity: number
            customerName: string | null
            originAddress: string | null
            originLat: number | null
            originLng: number | null
            destAddress: string
            destLat: number | null
            destLng: number | null
            earliestDeliveryAt: Date | null
            latestDeliveryAt: Date | null
            movementType?: ShipmentMovementType | null
        }>
        driverId?: string | null
        plannedStartAt?: string | Date
        notes?: string | null
        planMode?: 'draft' | 'approve'
        stopOrder?: string[]
    }) {
        const trip = await this.findOne(input.tripId)

        if (
            trip.status !== TripStatus.DRAFT &&
            trip.status !== TripStatus.PLANNED &&
            trip.status !== TripStatus.ASSIGNED
        ) {
            throw new BadRequestException(
                'Shipments can only be added to DRAFT or PLANNED trips',
            )
        }

        if (trip.vehicleId && trip.vehicleId !== input.vehicleId) {
            throw new BadRequestException(
                'Selected trip belongs to a different vehicle',
            )
        }

        const vehicle = await this.vehiclesService.findOne(input.vehicleId)
        const existingIds = [
            ...new Set(
                (trip.stops ?? []).flatMap((stop) =>
                    (stop.shipments ?? []).map((link) => link.shipmentId),
                ),
            ),
        ]
        const existingShipments =
            existingIds.length > 0
                ? await this.prisma.shipment.findMany({
                      where: { id: { in: existingIds } },
                  })
                : []

        const capacity = computeCapacity(vehicle, [
            ...existingShipments,
            ...input.shipments,
        ])
        if (!capacity.canFit) {
            throw new BadRequestException(
                capacity.message ?? 'Load exceeds vehicle capacity',
            )
        }

        const originKey = (address: string) => address.trim().toLowerCase()
        const shipmentIds = input.shipments.map((s) => s.id)

        return this.prisma.$transaction(async (tx) => {
            const stops = await tx.tripStop.findMany({
                where: { tripId: input.tripId },
                orderBy: { sequence: 'asc' },
                include: { shipments: true },
            })

            let nextSequence =
                stops.reduce((max, stop) => Math.max(max, stop.sequence), 0) + 1

            const originAddress = input.shipments[0].originAddress?.trim() ?? ''
            let pickup =
                originAddress.length > 0
                    ? stops.find(
                          (stop) =>
                              originKey(stop.address) ===
                                  originKey(originAddress) &&
                              stop.shipments.some(
                                  (link) => link.action === 'PICKUP',
                              ),
                      )
                    : undefined
            if (originAddress && !pickup) {
                pickup = stops.find(
                    (stop) =>
                        originKey(stop.address) === originKey(originAddress),
                )
            }

            if (originAddress) {
                if (pickup) {
                    await tx.tripStopShipment.createMany({
                        data: input.shipments.map((shipment) => ({
                            tripStopId: pickup!.id,
                            shipmentId: shipment.id,
                            action: 'PICKUP',
                        })),
                        skipDuplicates: true,
                    })
                } else {
                    await tx.tripStop.create({
                        data: {
                            tripId: input.tripId,
                            sequence: nextSequence,
                            name: 'Pickup',
                            address: originAddress,
                            lat: input.shipments[0].originLat,
                            lng: input.shipments[0].originLng,
                            status: StopStatus.PENDING,
                            shipments: {
                                create: input.shipments.map((shipment) => ({
                                    action: 'PICKUP',
                                    shipmentId: shipment.id,
                                })),
                            },
                        },
                    })
                    nextSequence += 1
                }
            }

            const destGroups = new Map<string, typeof input.shipments>()
            for (const shipment of input.shipments) {
                const key = originKey(shipment.destAddress)
                const group = destGroups.get(key) ?? []
                group.push(shipment)
                destGroups.set(key, group)
            }

            const normalizedOrder = (input.stopOrder ?? []).map((key) =>
                originKey(key),
            )
            const orderedDestKeys =
                normalizedOrder.length > 0
                    ? [
                          ...normalizedOrder.filter((key) =>
                              destGroups.has(key),
                          ),
                          ...[...destGroups.keys()].filter(
                              (key) => !normalizedOrder.includes(key),
                          ),
                      ]
                    : [...destGroups.keys()]

            for (const destKey of orderedDestKeys) {
                const group = destGroups.get(destKey)
                if (!group?.length) continue
                const dest = group[0]
                const existingDrop = stops.find(
                    (stop) =>
                        originKey(stop.address) ===
                            originKey(dest.destAddress) &&
                        (stop.shipments.some((link) => link.action === 'DROPOFF') ||
                            stop.shipments.length === 0),
                )

                if (existingDrop) {
                    await tx.tripStopShipment.createMany({
                        data: group.map((shipment) => ({
                            tripStopId: existingDrop.id,
                            shipmentId: shipment.id,
                            action: 'DROPOFF',
                        })),
                        skipDuplicates: true,
                    })
                    if (!existingDrop.name) {
                        await tx.tripStop.update({
                            where: { id: existingDrop.id },
                            data: {
                                name: dest.customerName
                                    ? `Deliver · ${dest.customerName}`
                                    : 'Deliver',
                                lat: dest.destLat ?? existingDrop.lat,
                                lng: dest.destLng ?? existingDrop.lng,
                            },
                        })
                    }
                } else {
                    const allPickup = group.every(
                        (s) => s.movementType === ShipmentMovementType.PICKUP,
                    )
                    await tx.tripStop.create({
                        data: {
                            tripId: input.tripId,
                            sequence: nextSequence,
                            name: allPickup
                                ? dest.customerName
                                    ? `Return · ${dest.customerName}`
                                    : 'Return to hub'
                                : dest.customerName
                                  ? `Deliver · ${dest.customerName}`
                                  : 'Deliver',
                            address: dest.destAddress,
                            lat: dest.destLat,
                            lng: dest.destLng,
                            windowStart: dest.earliestDeliveryAt,
                            windowEnd: dest.latestDeliveryAt,
                            status: StopStatus.PENDING,
                            shipments: {
                                create: group.map((shipment) => ({
                                    action: 'DROPOFF',
                                    shipmentId: shipment.id,
                                })),
                            },
                        },
                    })
                    nextSequence += 1
                }
            }

            const tripData: Prisma.TripUpdateInput = {
                totalQty: capacity.loadedQty,
                status:
                    input.planMode === 'approve'
                        ? TripStatus.PLANNED
                        : trip.status === TripStatus.ASSIGNED
                          ? TripStatus.ASSIGNED
                          : trip.status === TripStatus.PLANNED
                            ? TripStatus.PLANNED
                            : TripStatus.DRAFT,
                vehicle: { connect: { id: input.vehicleId } },
            }
            if (input.driverId !== undefined) {
                tripData.driver = input.driverId
                    ? { connect: { id: input.driverId } }
                    : undefined
            }
            if (input.plannedStartAt !== undefined) {
                tripData.plannedStartAt =
                    optionalDate(input.plannedStartAt) ?? null
            }
            if (input.notes !== undefined) {
                tripData.notes = optionalString(input.notes) ?? null
            }

            await tx.trip.update({
                where: { id: input.tripId },
                data: tripData,
            })

            await tx.shipment.updateMany({
                where: { id: { in: shipmentIds } },
                data: { status: ShipmentStatus.ASSIGNED },
            })

            return tx.trip.findUniqueOrThrow({
                where: { id: input.tripId },
                include: tripInclude,
            })
        })
    }

    /**
     * Customer outbound: post MM GI for each package-linked shipment, then
     * mark package DISPATCHED. Blocks trip start on failure.
     */
    private async issueGoodsForTripShipments(
        trip: Prisma.TripGetPayload<{ include: typeof tripInclude }>,
    ) {
        // a shipment is linked on both its pickup and drop-off stop — issue once
        const shipments = [
            ...new Map(
                (trip.stops ?? [])
                    .flatMap((stop) => (stop.shipments ?? []).map((link) => link.shipment))
                    .filter((shipment) => shipment != null)
                    .map((shipment) => [shipment.id, shipment]),
            ).values(),
        ]

        for (const shipment of shipments) {
            if (!shipment?.packageId) continue
            if (shipment.goodsIssueId) continue

            try {
                const gi = await this.goodsIssueService.issueAndPostFromPackage(
                    shipment.packageId,
                )
                await this.prisma.shipment.update({
                    where: { id: shipment.id },
                    data: { goodsIssueId: gi.id },
                })
                await this.prisma.wmPackage.updateMany({
                    where: {
                        id: shipment.packageId,
                        status: {
                            in: ['READY_FOR_DISPATCH', 'SEALED'],
                        },
                    },
                    data: { status: 'DISPATCHED' },
                })
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : 'Goods issue failed'
                throw new BadRequestException(
                    `Cannot start trip: goods issue failed for shipment ${shipment.reference} (package ${shipment.packageId}): ${message}`,
                )
            }
        }
    }
}
