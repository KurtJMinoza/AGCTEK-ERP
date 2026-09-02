import {
    BadRequestException,
    Injectable,
} from '@nestjs/common'
import {
    MaintenanceStatus,
    MaintenanceType,
    Prisma,
    VehicleStatus,
} from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    assertFound,
    optionalBoolean,
    optionalDate,
    optionalNumber,
    optionalString,
    parsePagination,
    requireString,
    type ListQuery,
    type PaginatedResult,
} from '../scm.utils'

type CreateMaintenanceBody = {
    vehicleId?: string
    type?: MaintenanceType
    status?: MaintenanceStatus
    title?: string
    description?: string | null
    odometerKm?: number
    cost?: number
    scheduledAt?: string | Date
    completedAt?: string | Date
    blocksRouting?: boolean
}

const MAINT_TYPES = new Set(Object.values(MaintenanceType))
const MAINT_STATUSES = new Set(Object.values(MaintenanceStatus))

const includeVehicle = {
    vehicle: true,
} satisfies Prisma.MaintenanceRecordInclude

@Injectable()
export class MaintenanceService {
    constructor(private readonly prisma: PrismaService) {}

    async findAll(
        query: ListQuery & { vehicleId?: string },
    ): Promise<PaginatedResult<unknown>> {
        const { page, pageSize, skip } = parsePagination(query)
        const where: Prisma.MaintenanceRecordWhereInput = {}

        if (query.vehicleId) {
            where.vehicleId = query.vehicleId
        }

        if (query.status) {
            if (!MAINT_STATUSES.has(query.status as MaintenanceStatus)) {
                throw new BadRequestException('Invalid maintenance status')
            }
            where.status = query.status as MaintenanceStatus
        }

        if (query.search?.trim()) {
            const q = query.search.trim()
            where.OR = [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
            ]
        }

        const [data, total] = await this.prisma.$transaction([
            this.prisma.maintenanceRecord.findMany({
                where,
                include: includeVehicle,
                orderBy: { scheduledAt: 'desc' },
                skip,
                take: pageSize,
            }),
            this.prisma.maintenanceRecord.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return assertFound(
            await this.prisma.maintenanceRecord.findUnique({
                where: { id },
                include: includeVehicle,
            }),
            'Maintenance record not found',
        )
    }

    private async syncVehicleRoutingBlock(vehicleId: string) {
        const blocking = await this.prisma.maintenanceRecord.count({
            where: {
                vehicleId,
                blocksRouting: true,
                status: {
                    in: [
                        MaintenanceStatus.SCHEDULED,
                        MaintenanceStatus.IN_PROGRESS,
                    ],
                },
            },
        })

        const vehicle = await this.prisma.vehicle.findUnique({
            where: { id: vehicleId },
        })
        if (!vehicle) return

        const odometerBlocked =
            vehicle.maxOdometerKm != null &&
            vehicle.odometerKm >= vehicle.maxOdometerKm

        await this.prisma.vehicle.update({
            where: { id: vehicleId },
            data: {
                routingBlocked: blocking > 0 || odometerBlocked,
                status:
                    blocking > 0
                        ? VehicleStatus.MAINTENANCE
                        : vehicle.status === VehicleStatus.MAINTENANCE
                          ? VehicleStatus.AVAILABLE
                          : vehicle.status,
            },
        })
    }

    async create(body: CreateMaintenanceBody) {
        const vehicleId = requireString(body.vehicleId, 'vehicleId')
        assertFound(
            await this.prisma.vehicle.findUnique({ where: { id: vehicleId } }),
            'Vehicle not found',
        )

        if (!body.type || !MAINT_TYPES.has(body.type)) {
            throw new BadRequestException('Valid maintenance type is required')
        }

        const status = body.status ?? MaintenanceStatus.SCHEDULED
        if (!MAINT_STATUSES.has(status)) {
            throw new BadRequestException('Invalid maintenance status')
        }

        const scheduledAt = optionalDate(body.scheduledAt)
        if (!scheduledAt) {
            throw new BadRequestException('scheduledAt is required')
        }

        const record = await this.prisma.maintenanceRecord.create({
            data: {
                vehicleId,
                type: body.type,
                status,
                title: requireString(body.title, 'title'),
                description: optionalString(body.description) ?? null,
                odometerKm: optionalNumber(body.odometerKm),
                cost: optionalNumber(body.cost),
                scheduledAt,
                completedAt: optionalDate(body.completedAt),
                blocksRouting: optionalBoolean(body.blocksRouting) ?? false,
            },
            include: includeVehicle,
        })

        await this.syncVehicleRoutingBlock(vehicleId)
        return this.findOne(record.id)
    }

    async update(id: string, body: CreateMaintenanceBody) {
        const existing = await this.findOne(id)
        const data: Prisma.MaintenanceRecordUpdateInput = {}

        if (body.type !== undefined) {
            if (!MAINT_TYPES.has(body.type)) {
                throw new BadRequestException('Invalid maintenance type')
            }
            data.type = body.type
        }
        if (body.status !== undefined) {
            if (!MAINT_STATUSES.has(body.status)) {
                throw new BadRequestException('Invalid maintenance status')
            }
            data.status = body.status
            if (
                body.status === MaintenanceStatus.COMPLETED &&
                !existing.completedAt
            ) {
                data.completedAt = new Date()
            }
        }
        if (body.title !== undefined) {
            data.title = requireString(body.title, 'title')
        }
        if (body.description !== undefined) {
            data.description = optionalString(body.description) ?? null
        }
        if (body.odometerKm !== undefined) {
            data.odometerKm = optionalNumber(body.odometerKm) ?? null
        }
        if (body.cost !== undefined) {
            data.cost = optionalNumber(body.cost) ?? null
        }
        if (body.scheduledAt !== undefined) {
            const scheduledAt = optionalDate(body.scheduledAt)
            if (!scheduledAt) {
                throw new BadRequestException('scheduledAt is required')
            }
            data.scheduledAt = scheduledAt
        }
        if (body.completedAt !== undefined) {
            data.completedAt = optionalDate(body.completedAt) ?? null
        }
        if (body.blocksRouting !== undefined) {
            data.blocksRouting =
                optionalBoolean(body.blocksRouting) ?? false
        }

        await this.prisma.maintenanceRecord.update({ where: { id }, data })
        await this.syncVehicleRoutingBlock(existing.vehicleId)
        return this.findOne(id)
    }

    async remove(id: string) {
        const existing = await this.findOne(id)
        await this.prisma.maintenanceRecord.delete({ where: { id } })
        await this.syncVehicleRoutingBlock(existing.vehicleId)
        return { ok: true }
    }
}
