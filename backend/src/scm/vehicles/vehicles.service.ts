import {
    BadRequestException,
    Injectable,
} from '@nestjs/common'
import {
    Prisma,
    TripStatus,
    VehicleStatus,
    VehicleType,
} from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { MaintenanceService } from '../maintenance/maintenance.service'
import { computeCapacity } from '../scm.capacity'
import {
    assertFound,
    optionalBoolean,
    optionalNumber,
    optionalString,
    parsePagination,
    requireInt,
    requireNumber,
    requireString,
    type ListQuery,
    type PaginatedResult,
} from '../scm.utils'

type CreateVehicleBody = {
    code?: string
    plateNumber?: string
    make?: string
    model?: string
    year?: number
    type?: VehicleType
    status?: VehicleStatus
    capacityWeightKg?: number
    capacityVolumeM3?: number
    capacityQty?: number
    odometerKm?: number
    /** @deprecated use maintenanceThresholdKm */
    maxOdometerKm?: number | null
    maintenanceThresholdKm?: number | null
    routingBlocked?: boolean
    telematicsDeviceId?: string | null
    notes?: string | null
}

const VEHICLE_TYPES = new Set(Object.values(VehicleType))
const VEHICLE_STATUSES = new Set(Object.values(VehicleStatus))

@Injectable()
export class VehiclesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly maintenanceService: MaintenanceService,
    ) {}

    async findAll(query: ListQuery): Promise<PaginatedResult<unknown>> {
        const { page, pageSize, skip } = parsePagination(query)
        const where: Prisma.VehicleWhereInput = {}

        if (query.status) {
            if (!VEHICLE_STATUSES.has(query.status as VehicleStatus)) {
                throw new BadRequestException('Invalid vehicle status')
            }
            where.status = query.status as VehicleStatus
        }

        if (query.search?.trim()) {
            const q = query.search.trim()
            where.OR = [
                { code: { contains: q, mode: 'insensitive' } },
                { plateNumber: { contains: q, mode: 'insensitive' } },
                { make: { contains: q, mode: 'insensitive' } },
                { model: { contains: q, mode: 'insensitive' } },
            ]
        }

        const [data, total] = await this.prisma.$transaction([
            this.prisma.vehicle.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
            }),
            this.prisma.vehicle.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return assertFound(
            await this.prisma.vehicle.findUnique({ where: { id } }),
            'Vehicle not found',
        )
    }

    private resolveThreshold(
        body: CreateVehicleBody,
    ): number | null | undefined {
        if (body.maintenanceThresholdKm !== undefined) {
            return body.maintenanceThresholdKm === null
                ? null
                : optionalNumber(body.maintenanceThresholdKm) ?? null
        }
        if (body.maxOdometerKm !== undefined) {
            return body.maxOdometerKm === null
                ? null
                : optionalNumber(body.maxOdometerKm) ?? null
        }
        return undefined
    }

    async create(body: CreateVehicleBody) {
        const type = body.type
        if (!type || !VEHICLE_TYPES.has(type)) {
            throw new BadRequestException('Valid vehicle type is required')
        }

        const status = body.status ?? VehicleStatus.AVAILABLE
        if (!VEHICLE_STATUSES.has(status)) {
            throw new BadRequestException('Invalid vehicle status')
        }

        const threshold = this.resolveThreshold(body)

        const vehicle = await this.prisma.vehicle.create({
            data: {
                code: requireString(body.code, 'code'),
                plateNumber: requireString(body.plateNumber, 'plateNumber'),
                make: requireString(body.make, 'make'),
                model: requireString(body.model, 'model'),
                year: optionalNumber(body.year),
                type,
                status,
                capacityQty: requireInt(body.capacityQty, 'capacityQty'),
                capacityWeightKg: optionalNumber(body.capacityWeightKg) ?? 0,
                capacityVolumeM3: optionalNumber(body.capacityVolumeM3) ?? 0,
                odometerKm: optionalNumber(body.odometerKm) ?? 0,
                maintenanceThresholdKm: threshold ?? null,
                routingBlocked: optionalBoolean(body.routingBlocked) ?? false,
                telematicsDeviceId:
                    optionalString(body.telematicsDeviceId) ?? null,
                notes: optionalString(body.notes) ?? null,
            },
        })

        await this.maintenanceService.ensureOdometerMaintenanceDue(vehicle.id)
        return this.findOne(vehicle.id)
    }

    async update(id: string, body: CreateVehicleBody) {
        await this.findOne(id)

        const data: Prisma.VehicleUpdateInput = {}

        if (body.code !== undefined) data.code = requireString(body.code, 'code')
        if (body.plateNumber !== undefined) {
            data.plateNumber = requireString(body.plateNumber, 'plateNumber')
        }
        if (body.make !== undefined) data.make = requireString(body.make, 'make')
        if (body.model !== undefined) {
            data.model = requireString(body.model, 'model')
        }
        if (body.year !== undefined) data.year = optionalNumber(body.year) ?? null
        if (body.type !== undefined) {
            if (!VEHICLE_TYPES.has(body.type)) {
                throw new BadRequestException('Invalid vehicle type')
            }
            data.type = body.type
        }
        if (body.status !== undefined) {
            if (!VEHICLE_STATUSES.has(body.status)) {
                throw new BadRequestException('Invalid vehicle status')
            }
            data.status = body.status
        }
        if (body.capacityQty !== undefined) {
            data.capacityQty = requireInt(body.capacityQty, 'capacityQty')
        }
        if (body.capacityWeightKg !== undefined) {
            data.capacityWeightKg = requireNumber(
                body.capacityWeightKg,
                'capacityWeightKg',
            )
        }
        if (body.capacityVolumeM3 !== undefined) {
            data.capacityVolumeM3 = requireNumber(
                body.capacityVolumeM3,
                'capacityVolumeM3',
            )
        }
        if (body.odometerKm !== undefined) {
            data.odometerKm = requireNumber(body.odometerKm, 'odometerKm')
        }
        const threshold = this.resolveThreshold(body)
        if (threshold !== undefined) {
            data.maintenanceThresholdKm = threshold
        }
        if (body.routingBlocked !== undefined) {
            data.routingBlocked =
                optionalBoolean(body.routingBlocked) ?? false
        }
        if (body.telematicsDeviceId !== undefined) {
            data.telematicsDeviceId =
                optionalString(body.telematicsDeviceId) ?? null
        }
        if (body.notes !== undefined) {
            data.notes = optionalString(body.notes) ?? null
        }

        await this.prisma.vehicle.update({ where: { id }, data })
        await this.maintenanceService.ensureOdometerMaintenanceDue(id)
        return this.findOne(id)
    }

    async remove(id: string) {
        await this.findOne(id)
        await this.prisma.vehicle.delete({ where: { id } })
        return { ok: true }
    }

    /**
     * Operational cargo on a vehicle (trip-bound shipments), not MM warehouse stock.
     * Prefers IN_TRANSIT trip; else most recent ASSIGNED / PLANNED trip.
     */
    async getCargo(vehicleId: string) {
        const vehicle = await this.findOne(vehicleId)

        const tripInclude = {
            stops: {
                orderBy: { sequence: 'asc' as const },
                include: {
                    shipments: {
                        include: { shipment: true },
                    },
                },
            },
        } satisfies Prisma.TripInclude

        let trip =
            (await this.prisma.trip.findFirst({
                where: {
                    vehicleId,
                    status: TripStatus.IN_TRANSIT,
                },
                orderBy: { updatedAt: 'desc' },
                include: tripInclude,
            })) ?? null

        let loadLabel: 'active' | 'planned' | 'none' = 'none'

        if (trip) {
            loadLabel = 'active'
        } else {
            trip = await this.prisma.trip.findFirst({
                where: {
                    vehicleId,
                    status: {
                        in: [TripStatus.ASSIGNED, TripStatus.PLANNED],
                    },
                },
                orderBy: { updatedAt: 'desc' },
                include: tripInclude,
            })
            if (trip) loadLabel = 'planned'
        }

        if (!trip) {
            return {
                vehicleId: vehicle.id,
                vehicleStatus: vehicle.status,
                loadLabel: 'none' as const,
                tripId: null,
                tripCode: null,
                tripStatus: null,
                stops: [],
                shipments: [],
                summary: {
                    ...computeCapacity(vehicle, []),
                    capacityWeightKg: vehicle.capacityWeightKg,
                    capacityVolumeM3: vehicle.capacityVolumeM3,
                    loadedWeightKg: 0,
                    loadedVolumeM3: 0,
                    fragileCount: 0,
                    coldChainCount: 0,
                },
            }
        }

        const shipmentMap = new Map<
            string,
            {
                id: string
                reference: string
                materialCode: string | null
                description: string | null
                quantity: number
                weightKg: number
                volumeM3: number
                isFragile: boolean
                requiresColdChain: boolean
                status: string
                shipToName: string | null
                shipToAddress: string
                stopSequence: number | null
                stopId: string | null
                action: string | null
            }
        >()

        const stops = (trip.stops ?? []).map((stop) => {
            const stopShipments = (stop.shipments ?? []).map((link) => {
                const s = link.shipment
                const cargo = {
                    id: s.id,
                    reference: s.reference,
                    materialCode: s.materialCode ?? null,
                    description: s.description ?? null,
                    quantity: s.quantity ?? 0,
                    weightKg: s.weightKg ?? 0,
                    volumeM3: s.volumeM3 ?? 0,
                    isFragile: Boolean(s.isFragile),
                    requiresColdChain: Boolean(s.requiresColdChain),
                    status: s.status,
                    shipToName: s.customerName ?? null,
                    shipToAddress: s.destAddress,
                    stopSequence: stop.sequence,
                    stopId: stop.id,
                    action: link.action,
                }
                // Prefer DROPOFF row for display identity when both exist
                const existing = shipmentMap.get(s.id)
                if (!existing || link.action === 'DROPOFF') {
                    shipmentMap.set(s.id, cargo)
                }
                return cargo
            })

            return {
                stopId: stop.id,
                sequence: stop.sequence,
                name: stop.name,
                address: stop.address,
                status: stop.status,
                shipments: stopShipments,
            }
        })

        const shipments = [...shipmentMap.values()]
        const capacity = computeCapacity(vehicle, shipments)
        const loadedWeightKg = shipments.reduce(
            (sum, item) => sum + (item.weightKg || 0),
            0,
        )
        const loadedVolumeM3 = shipments.reduce(
            (sum, item) => sum + (item.volumeM3 || 0),
            0,
        )

        return {
            vehicleId: vehicle.id,
            vehicleStatus: vehicle.status,
            loadLabel,
            tripId: trip.id,
            tripCode: trip.code,
            tripStatus: trip.status,
            stops,
            shipments,
            summary: {
                ...capacity,
                capacityWeightKg: vehicle.capacityWeightKg,
                capacityVolumeM3: vehicle.capacityVolumeM3,
                loadedWeightKg,
                loadedVolumeM3,
                fragileCount: shipments.filter((s) => s.isFragile).length,
                coldChainCount: shipments.filter((s) => s.requiresColdChain)
                    .length,
            },
        }
    }

    /** True when open blocking maintenance or vehicle status prevents routing. */
    isBlockedFromRouting(vehicle: {
        routingBlocked: boolean
        status: VehicleStatus
    }): boolean {
        if (vehicle.routingBlocked) return true
        if (
            vehicle.status === VehicleStatus.MAINTENANCE ||
            vehicle.status === VehicleStatus.OUT_OF_SERVICE ||
            vehicle.status === VehicleStatus.INACTIVE
        ) {
            return true
        }
        return false
    }
}
