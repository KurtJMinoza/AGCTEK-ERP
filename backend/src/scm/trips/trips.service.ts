import {
    BadRequestException,
    Injectable,
} from '@nestjs/common'
import { Prisma, ShipmentMovementType, ShipmentStatus, StopStatus, TripStatus, VehicleStatus, DriverStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { VehiclesService } from '../vehicles/vehicles.service'
import { MaintenanceService } from '../maintenance/maintenance.service'
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
    constructor(
        private readonly prisma: PrismaService,
        private readonly vehiclesService: VehiclesService,
        private readonly maintenanceService: MaintenanceService,
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
     * Driver mobile — active trip for a driver (ASSIGNED or IN_TRANSIT).
     * Prefers IN_TRANSIT when both somehow exist.
     */
    async findActiveForDriver(driverId: string) {
        const id = requireString(driverId, 'driverId')
        const inTransit = await this.prisma.trip.findFirst({
            where: { driverId: id, status: TripStatus.IN_TRANSIT },
            include: tripInclude,
            orderBy: { updatedAt: 'desc' },
        })
        if (inTransit) return inTransit

        return this.prisma.trip.findFirst({
            where: { driverId: id, status: TripStatus.ASSIGNED },
            include: tripInclude,
            orderBy: { updatedAt: 'desc' },
        })
    }

    /** Driver 5.1 — start route (ASSIGNED → IN_TRANSIT). */
    async startTrip(id: string) {
        const trip = await this.findOne(id)
        if (
            trip.status !== TripStatus.ASSIGNED &&
            trip.status !== TripStatus.PLANNED
        ) {
            if (trip.status === TripStatus.IN_TRANSIT) {
                return trip
            }
            throw new BadRequestException(
                `Cannot start trip from status ${trip.status}`,
            )
        }
        return this.updateStatus(id, TripStatus.IN_TRANSIT)
    }

    /** Driver 5.5 — mark stop arrived. */
    async arriveStop(tripId: string, stopId: string) {
        return this.updateStop(tripId, stopId, { status: StopStatus.ARRIVED })
    }

    /** Driver 6.x — save POD fields on stop (and optionally shipments). */
    async saveStopPod(
        tripId: string,
        stopId: string,
        body: {
            podSignatureUrl?: string | null
            podPhotoUrl?: string | null
            podNotes?: string | null
            notes?: string | null
        },
    ) {
        await this.findOne(tripId)
        assertFound(
            await this.prisma.tripStop.findFirst({
                where: { id: stopId, tripId },
            }),
            'Stop not found',
        )

        await this.prisma.tripStop.update({
            where: { id: stopId },
            data: {
                podSignatureUrl:
                    body.podSignatureUrl !== undefined
                        ? optionalString(body.podSignatureUrl) ?? null
                        : undefined,
                podPhotoUrl:
                    body.podPhotoUrl !== undefined
                        ? optionalString(body.podPhotoUrl) ?? null
                        : undefined,
                podNotes:
                    body.podNotes !== undefined
                        ? optionalString(body.podNotes) ?? null
                        : undefined,
                notes:
                    body.notes !== undefined
                        ? optionalString(body.notes) ?? null
                        : undefined,
            },
        })
        return this.findOne(tripId)
    }

    /**
     * Driver 6.x — confirm deliver (or fail) at stop.
     * Marks stop COMPLETED/FAILED and updates DROPOFF shipments.
     */
    async deliverStop(
        tripId: string,
        stopId: string,
        body: {
            outcome?: 'DELIVERED' | 'FAILED'
            podSignatureUrl?: string | null
            podPhotoUrl?: string | null
            podNotes?: string | null
            failureReason?: string | null
            notes?: string | null
        },
    ) {
        const trip = await this.findOne(tripId)
        const stop = assertFound(
            await this.prisma.tripStop.findFirst({
                where: { id: stopId, tripId },
                include: { shipments: true },
            }),
            'Stop not found',
        )

        const outcome = body.outcome === 'FAILED' ? 'FAILED' : 'DELIVERED'
        if (outcome === 'FAILED') {
            const reason = optionalString(body.failureReason)
            if (!reason) {
                throw new BadRequestException(
                    'failureReason is required when outcome is FAILED',
                )
            }
        }

        const now = new Date()
        await this.prisma.tripStop.update({
            where: { id: stopId },
            data: {
                status:
                    outcome === 'FAILED'
                        ? StopStatus.FAILED
                        : StopStatus.COMPLETED,
                completedAt: stop.completedAt ?? now,
                arrivedAt: stop.arrivedAt ?? now,
                podSignatureUrl:
                    body.podSignatureUrl !== undefined
                        ? optionalString(body.podSignatureUrl) ?? null
                        : undefined,
                podPhotoUrl:
                    body.podPhotoUrl !== undefined
                        ? optionalString(body.podPhotoUrl) ?? null
                        : undefined,
                podNotes:
                    body.podNotes !== undefined
                        ? optionalString(body.podNotes) ?? null
                        : undefined,
                failureReason:
                    outcome === 'FAILED'
                        ? optionalString(body.failureReason) ?? null
                        : null,
                notes:
                    body.notes !== undefined
                        ? optionalString(body.notes) ?? null
                        : undefined,
            },
        })

        const dropoffIds = (stop.shipments ?? [])
            .filter((link) => link.action === 'DROPOFF')
            .map((link) => link.shipmentId)

        if (dropoffIds.length > 0) {
            if (outcome === 'DELIVERED') {
                const shipmentData: Prisma.ShipmentUpdateManyMutationInput = {
                    status: ShipmentStatus.DELIVERED,
                    deliveredAt: now,
                }
                const sig = optionalString(body.podSignatureUrl)
                const photo = optionalString(body.podPhotoUrl)
                const note =
                    optionalString(body.podNotes) ?? optionalString(body.notes)
                if (sig) shipmentData.podSignatureUrl = sig
                if (photo) shipmentData.podPhotoUrl = photo
                if (note) shipmentData.notes = note
                await this.prisma.shipment.updateMany({
                    where: { id: { in: dropoffIds } },
                    data: shipmentData,
                })
            } else {
                const note =
                    optionalString(body.failureReason) ??
                    optionalString(body.podNotes)
                await this.prisma.shipment.updateMany({
                    where: { id: { in: dropoffIds } },
                    data: {
                        status: ShipmentStatus.CANCELLED,
                        ...(note ? { notes: note } : {}),
                    },
                })
            }
        }

        const refreshed = await this.findOne(tripId)
        const remaining = (refreshed.stops ?? []).filter(
            (s) =>
                s.status === StopStatus.PENDING ||
                s.status === StopStatus.ARRIVED,
        )
        if (
            remaining.length === 0 &&
            refreshed.status === TripStatus.IN_TRANSIT
        ) {
            return this.updateStatus(tripId, TripStatus.COMPLETED)
        }

        return refreshed
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

    async create(body: CreateTripBody) {
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
        await this.findOne(id)

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
        }

        const data: Prisma.TripUpdateInput = { status }

        // Phase 3.3 — actual start (startedAt)
        if (status === TripStatus.IN_TRANSIT && !trip.startedAt) {
            data.startedAt = new Date()
        }
        if (completing) {
            data.completedAt = trip.completedAt ?? new Date()
        }

        await this.prisma.trip.update({
            where: { id },
            data,
            include: tripInclude,
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
                    status: { not: ShipmentStatus.DELIVERED },
                },
                data: { status: ShipmentStatus.DELIVERED, deliveredAt: new Date() },
            })
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
        await this.findOne(tripId)

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
        if (body.status !== undefined) {
            if (!STOP_STATUSES.has(body.status)) {
                throw new BadRequestException('Invalid stop status')
            }
            data.status = body.status
            if (body.status === StopStatus.ARRIVED && !stop.arrivedAt) {
                data.arrivedAt = new Date()
            }
            if (body.status === StopStatus.COMPLETED && !stop.completedAt) {
                data.completedAt = new Date()
            }
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
        await this.findOne(tripId)
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
        await this.findOne(id)
        await this.prisma.trip.delete({ where: { id } })
        return { ok: true }
    }

    /**
     * Build or fill a planned trip from READY shipments + a routing-eligible vehicle.
     * Reuses an existing DRAFT/PLANNED trip for the vehicle when tripId is set,
     * or when one already exists (unless forceNewTrip).
     * Re-validates item quantity vs vehicle.capacityQty server-side.
     */
    async assignLoad(body: AssignLoadBody) {
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
}
