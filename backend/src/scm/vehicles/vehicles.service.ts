import {
    BadRequestException,
    Injectable,
} from '@nestjs/common'
import {
    Prisma,
    VehicleStatus,
    VehicleType,
} from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    assertFound,
    optionalBoolean,
    optionalNumber,
    optionalString,
    parsePagination,
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
    odometerKm?: number
    maxOdometerKm?: number | null
    routingBlocked?: boolean
    notes?: string | null
}

const VEHICLE_TYPES = new Set(Object.values(VehicleType))
const VEHICLE_STATUSES = new Set(Object.values(VehicleStatus))

@Injectable()
export class VehiclesService {
    constructor(private readonly prisma: PrismaService) {}

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

    async create(body: CreateVehicleBody) {
        const type = body.type
        if (!type || !VEHICLE_TYPES.has(type)) {
            throw new BadRequestException('Valid vehicle type is required')
        }

        const status = body.status ?? VehicleStatus.AVAILABLE
        if (!VEHICLE_STATUSES.has(status)) {
            throw new BadRequestException('Invalid vehicle status')
        }

        return this.prisma.vehicle.create({
            data: {
                code: requireString(body.code, 'code'),
                plateNumber: requireString(body.plateNumber, 'plateNumber'),
                make: requireString(body.make, 'make'),
                model: requireString(body.model, 'model'),
                year: optionalNumber(body.year),
                type,
                status,
                capacityWeightKg: requireNumber(
                    body.capacityWeightKg,
                    'capacityWeightKg',
                ),
                capacityVolumeM3: requireNumber(
                    body.capacityVolumeM3,
                    'capacityVolumeM3',
                ),
                odometerKm: optionalNumber(body.odometerKm) ?? 0,
                maxOdometerKm: optionalNumber(body.maxOdometerKm),
                routingBlocked: optionalBoolean(body.routingBlocked) ?? false,
                notes: optionalString(body.notes) ?? null,
            },
        })
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
        if (body.maxOdometerKm !== undefined) {
            data.maxOdometerKm =
                body.maxOdometerKm === null
                    ? null
                    : optionalNumber(body.maxOdometerKm) ?? null
        }
        if (body.routingBlocked !== undefined) {
            data.routingBlocked =
                optionalBoolean(body.routingBlocked) ?? false
        }
        if (body.notes !== undefined) {
            data.notes = optionalString(body.notes) ?? null
        }

        return this.prisma.vehicle.update({ where: { id }, data })
    }

    async remove(id: string) {
        await this.findOne(id)
        await this.prisma.vehicle.delete({ where: { id } })
        return { ok: true }
    }

    /** True when odometer limit exceeded or routingBlocked flag is set */
    isBlockedFromRouting(vehicle: {
        routingBlocked: boolean
        odometerKm: number
        maxOdometerKm: number | null
        status: VehicleStatus
    }): boolean {
        if (vehicle.routingBlocked) return true
        if (
            vehicle.maxOdometerKm != null &&
            vehicle.odometerKm >= vehicle.maxOdometerKm
        ) {
            return true
        }
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
