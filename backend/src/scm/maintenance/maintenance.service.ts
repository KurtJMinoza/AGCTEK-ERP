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
const ODOMETER_DUE_TITLE_PREFIX = 'Odometer service due'

const includeVehicle = {
    vehicle: true,
} satisfies Prisma.MaintenanceRecordInclude

@Injectable()
export class MaintenanceService {
    constructor(private readonly prisma: PrismaService) {}

    async findAll(
        query: ListQuery & { vehicleId?: string; type?: string },
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

        if (query.type) {
            if (!MAINT_TYPES.has(query.type as MaintenanceType)) {
                throw new BadRequestException('Invalid maintenance type')
            }
            where.type = query.type as MaintenanceType
        }

        if (query.search?.trim()) {
            const q = query.search.trim()
            where.OR = [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                {
                    vehicle: {
                        is: {
                            OR: [
                                {
                                    plateNumber: {
                                        contains: q,
                                        mode: 'insensitive',
                                    },
                                },
                                {
                                    code: {
                                        contains: q,
                                        mode: 'insensitive',
                                    },
                                },
                            ],
                        },
                    },
                },
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

    /**
     * When last recorded odometer hits maintenanceThresholdKm, open a
     * preventative maintenance that blocks routing (idempotent).
     */
    async ensureOdometerMaintenanceDue(vehicleId: string) {
        const vehicle = await this.prisma.vehicle.findUnique({
            where: { id: vehicleId },
        })
        if (!vehicle) return null
        if (
            vehicle.maintenanceThresholdKm == null ||
            vehicle.odometerKm < vehicle.maintenanceThresholdKm
        ) {
            return null
        }

        const openDue = await this.prisma.maintenanceRecord.findFirst({
            where: {
                vehicleId,
                type: MaintenanceType.PREVENTATIVE,
                blocksRouting: true,
                status: {
                    in: [
                        MaintenanceStatus.SCHEDULED,
                        MaintenanceStatus.IN_PROGRESS,
                    ],
                },
                title: { startsWith: ODOMETER_DUE_TITLE_PREFIX },
            },
        })
        if (openDue) {
            await this.syncVehicleRoutingBlock(vehicleId)
            return openDue
        }

        const threshold = vehicle.maintenanceThresholdKm
        const record = await this.prisma.maintenanceRecord.create({
            data: {
                vehicleId,
                type: MaintenanceType.PREVENTATIVE,
                status: MaintenanceStatus.SCHEDULED,
                title: `${ODOMETER_DUE_TITLE_PREFIX} (${threshold.toLocaleString()} km)`,
                description: `Last recorded odometer ${vehicle.odometerKm.toLocaleString()} km reached the maintenance threshold of ${threshold.toLocaleString()} km.`,
                odometerKm: vehicle.odometerKm,
                scheduledAt: new Date(),
                blocksRouting: true,
            },
        })

        await this.syncVehicleRoutingBlock(vehicleId)
        return record
    }

    async syncVehicleRoutingBlock(vehicleId: string) {
        // Block when IN_PROGRESS (always) or SCHEDULED/IN_PROGRESS with blocksRouting
        const blocking = await this.prisma.maintenanceRecord.count({
            where: {
                vehicleId,
                status: {
                    in: [
                        MaintenanceStatus.SCHEDULED,
                        MaintenanceStatus.IN_PROGRESS,
                    ],
                },
                OR: [
                    { status: MaintenanceStatus.IN_PROGRESS },
                    { blocksRouting: true },
                ],
            },
        })

        const vehicle = await this.prisma.vehicle.findUnique({
            where: { id: vehicleId },
        })
        if (!vehicle) return

        const onActiveTrip = vehicle.status === VehicleStatus.IN_TRANSIT

        await this.prisma.vehicle.update({
            where: { id: vehicleId },
            data: {
                routingBlocked: blocking > 0,
                status:
                    blocking > 0
                        ? // Don't pull a live trip into MAINTENANCE status
                          onActiveTrip
                            ? vehicle.status
                            : VehicleStatus.MAINTENANCE
                        : vehicle.status === VehicleStatus.MAINTENANCE
                          ? VehicleStatus.AVAILABLE
                          : vehicle.status,
            },
        })
    }

    async create(body: CreateMaintenanceBody) {
        const vehicleId = requireString(body.vehicleId, 'vehicleId')
        const vehicle = assertFound(
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

        const blocksRouting =
            status === MaintenanceStatus.IN_PROGRESS
                ? true
                : (optionalBoolean(body.blocksRouting) ?? false)

        const record = await this.prisma.maintenanceRecord.create({
            data: {
                vehicleId,
                type: body.type,
                status,
                title: requireString(body.title, 'title'),
                description: optionalString(body.description) ?? null,
                odometerKm:
                    optionalNumber(body.odometerKm) ?? vehicle.odometerKm,
                cost: optionalNumber(body.cost),
                scheduledAt,
                completedAt: optionalDate(body.completedAt),
                blocksRouting,
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
            if (body.status === MaintenanceStatus.IN_PROGRESS) {
                data.blocksRouting = true
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
        // IN_PROGRESS always blocks (overrides explicit false)
        if (
            (body.status ?? existing.status) === MaintenanceStatus.IN_PROGRESS
        ) {
            data.blocksRouting = true
        }

        await this.prisma.maintenanceRecord.update({ where: { id }, data })

        // After odometer-due service is done, clear threshold so it does not
        // immediately re-open. Set the next service km on the vehicle afterward.
        const completedOdometerDue =
            body.status === MaintenanceStatus.COMPLETED &&
            existing.title.startsWith(ODOMETER_DUE_TITLE_PREFIX)
        if (completedOdometerDue) {
            await this.prisma.vehicle.update({
                where: { id: existing.vehicleId },
                data: { maintenanceThresholdKm: null },
            })
        }

        await this.syncVehicleRoutingBlock(existing.vehicleId)
        return this.findOne(id)
    }

    async remove(id: string) {
        const existing = await this.findOne(id)
        await this.prisma.maintenanceRecord.delete({ where: { id } })
        await this.syncVehicleRoutingBlock(existing.vehicleId)
        return { ok: true }
    }

    /**
     * Set maintenanceThresholdKm on all vehicles or a selected subset.
     * Immediately opens odometer-due records for vehicles already at/over threshold.
     */
    async setOdometerThresholds(body: {
        thresholdKm?: number | null
        vehicleIds?: string[]
    }) {
        if (!('thresholdKm' in body)) {
            throw new BadRequestException(
                'thresholdKm is required (number or null)',
            )
        }

        let thresholdKm: number | null
        if (body.thresholdKm === null) {
            thresholdKm = null
        } else {
            const n = optionalNumber(body.thresholdKm)
            if (n == null || !(n > 0)) {
                throw new BadRequestException(
                    'thresholdKm must be a number greater than 0, or null to clear',
                )
            }
            thresholdKm = n
        }

        const ids = Array.isArray(body.vehicleIds)
            ? body.vehicleIds
                  .map((id) => (typeof id === 'string' ? id.trim() : ''))
                  .filter(Boolean)
            : []

        const where: Prisma.VehicleWhereInput =
            ids.length > 0 ? { id: { in: ids } } : {}

        if (ids.length > 0) {
            const found = await this.prisma.vehicle.count({
                where: { id: { in: ids } },
            })
            if (found !== ids.length) {
                throw new BadRequestException(
                    'One or more vehicleIds were not found',
                )
            }
        }

        const result = await this.prisma.vehicle.updateMany({
            where,
            data: { maintenanceThresholdKm: thresholdKm },
        })

        const vehicles = await this.prisma.vehicle.findMany({
            where,
            select: { id: true },
        })

        let dueOpened = 0
        for (const vehicle of vehicles) {
            const due = await this.ensureOdometerMaintenanceDue(vehicle.id)
            if (due) dueOpened += 1
        }

        return {
            updated: result.count,
            thresholdKm,
            dueOpened,
            scope: ids.length > 0 ? 'selected' : 'all',
        }
    }
}
