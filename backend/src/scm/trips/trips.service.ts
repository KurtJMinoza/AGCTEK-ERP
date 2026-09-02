import {
    BadRequestException,
    Injectable,
} from '@nestjs/common'
import { Prisma, StopStatus, TripStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { VehiclesService } from '../vehicles/vehicles.service'
import {
    assertFound,
    optionalDate,
    optionalNumber,
    optionalString,
    parsePagination,
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
    shipments?: Array<{
        shipmentId?: string
        action?: string
    }>
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
    ) {}

    async findAll(query: ListQuery): Promise<PaginatedResult<unknown>> {
        const { page, pageSize, skip } = parsePagination(query)
        const where: Prisma.TripWhereInput = {}

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
                'Vehicle is blocked from routing (maintenance, odometer limit, or inactive status)',
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

        return this.prisma.trip.create({
            data: {
                code: requireString(body.code, 'code'),
                vehicleId: body.vehicleId || null,
                driverId: body.driverId || null,
                status,
                plannedStartAt: optionalDate(body.plannedStartAt),
                notes: optionalString(body.notes) ?? null,
                stops: this.buildStopCreates(body.stops),
            },
            include: tripInclude,
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

        if (
            (status === TripStatus.PLANNED || status === TripStatus.IN_PROGRESS) &&
            trip.vehicleId
        ) {
            await this.assertVehicleAssignable(trip.vehicleId)
        }

        const data: Prisma.TripUpdateInput = { status }

        if (status === TripStatus.IN_PROGRESS && !trip.startedAt) {
            data.startedAt = new Date()
        }
        if (status === TripStatus.COMPLETED && !trip.completedAt) {
            data.completedAt = new Date()
        }

        return this.prisma.trip.update({
            where: { id },
            data,
            include: tripInclude,
        })
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
}
