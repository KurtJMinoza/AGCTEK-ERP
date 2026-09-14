import {
    BadRequestException,
    Injectable,
} from '@nestjs/common'
import {
    Prisma,
    VehicleDocumentKind,
    VehicleDocumentStatus,
} from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { MaintenanceService } from '../maintenance/maintenance.service'
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
import {
    defaultBlocksVehicle,
    deriveDocumentStatus,
} from './vehicle-document.utils'

type CreateDocumentBody = {
    vehicleId?: string
    kind?: VehicleDocumentKind
    documentNo?: string
    issuer?: string | null
    issuedAt?: string | Date | null
    expiresAt?: string | Date
    coverageNote?: string | null
    fileUrl?: string | null
    remindDaysBefore?: number
    blocksVehicle?: boolean
    notes?: string | null
    /** Soft-delete only — prefer CANCELLED over hard delete */
    status?: VehicleDocumentStatus
}

const DOC_KINDS = new Set(Object.values(VehicleDocumentKind))
const DOC_STATUSES = new Set(Object.values(VehicleDocumentStatus))

const includeVehicle = {
    vehicle: {
        select: {
            id: true,
            code: true,
            plateNumber: true,
            status: true,
            routingBlocked: true,
        },
    },
} satisfies Prisma.VehicleDocumentInclude

@Injectable()
export class VehicleDocumentsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly maintenanceService: MaintenanceService,
    ) {}

    private serialize(
        doc: Prisma.VehicleDocumentGetPayload<{ include: typeof includeVehicle }>,
    ) {
        const status = deriveDocumentStatus(
            doc.expiresAt,
            doc.remindDaysBefore,
            doc.status === VehicleDocumentStatus.CANCELLED,
        )
        return { ...doc, status }
    }

    async recomputeAndPersistStatus(id: string) {
        const doc = await this.prisma.vehicleDocument.findUnique({
            where: { id },
        })
        if (!doc) return null
        if (doc.status === VehicleDocumentStatus.CANCELLED) return doc
        const next = deriveDocumentStatus(doc.expiresAt, doc.remindDaysBefore)
        if (next !== doc.status) {
            return this.prisma.vehicleDocument.update({
                where: { id },
                data: { status: next },
            })
        }
        return doc
    }

    async findAll(
        query: ListQuery & {
            vehicleId?: string
            kind?: string
            expiring?: string
        },
    ): Promise<PaginatedResult<unknown>> {
        const { page, pageSize, skip } = parsePagination(query)
        const where: Prisma.VehicleDocumentWhereInput = {}

        if (query.vehicleId) {
            where.vehicleId = query.vehicleId
        }

        if (query.kind) {
            if (!DOC_KINDS.has(query.kind as VehicleDocumentKind)) {
                throw new BadRequestException('Invalid document kind')
            }
            where.kind = query.kind as VehicleDocumentKind
        }

        if (query.status) {
            if (!DOC_STATUSES.has(query.status as VehicleDocumentStatus)) {
                throw new BadRequestException('Invalid document status')
            }
            where.status = query.status as VehicleDocumentStatus
        }

        // Refresh derived statuses for candidates before filter (bounded page scan)
        const candidates = await this.prisma.vehicleDocument.findMany({
            where: {
                vehicleId: query.vehicleId,
                kind: where.kind,
                status: { not: VehicleDocumentStatus.CANCELLED },
            },
            select: {
                id: true,
                expiresAt: true,
                remindDaysBefore: true,
                status: true,
            },
            take: 500,
        })
        for (const c of candidates) {
            if (c.status === VehicleDocumentStatus.CANCELLED) continue
            const next = deriveDocumentStatus(c.expiresAt, c.remindDaysBefore)
            if (next !== c.status) {
                await this.prisma.vehicleDocument.update({
                    where: { id: c.id },
                    data: { status: next },
                })
            }
        }

        if (query.expiring === '1' || query.expiring === 'true') {
            where.status = VehicleDocumentStatus.EXPIRING_SOON
        }

        if (query.search?.trim()) {
            const q = query.search.trim()
            where.OR = [
                { documentNo: { contains: q, mode: 'insensitive' } },
                { issuer: { contains: q, mode: 'insensitive' } },
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

        const [rows, total] = await this.prisma.$transaction([
            this.prisma.vehicleDocument.findMany({
                where,
                include: includeVehicle,
                orderBy: { expiresAt: 'asc' },
                skip,
                take: pageSize,
            }),
            this.prisma.vehicleDocument.count({ where }),
        ])

        return {
            data: rows.map((row) => this.serialize(row)),
            total,
            page,
            pageSize,
        }
    }

    async findByVehicle(vehicleId: string) {
        assertFound(
            await this.prisma.vehicle.findUnique({ where: { id: vehicleId } }),
            'Vehicle not found',
        )

        const rows = await this.prisma.vehicleDocument.findMany({
            where: { vehicleId },
            include: includeVehicle,
            orderBy: [{ kind: 'asc' }, { expiresAt: 'asc' }],
        })

        const data = []
        for (const row of rows) {
            if (row.status !== VehicleDocumentStatus.CANCELLED) {
                const next = deriveDocumentStatus(
                    row.expiresAt,
                    row.remindDaysBefore,
                )
                if (next !== row.status) {
                    await this.prisma.vehicleDocument.update({
                        where: { id: row.id },
                        data: { status: next },
                    })
                    row.status = next
                }
            }
            data.push(this.serialize(row))
        }
        return data
    }

    async findOne(id: string) {
        const row = assertFound(
            await this.prisma.vehicleDocument.findUnique({
                where: { id },
                include: includeVehicle,
            }),
            'Vehicle document not found',
        )
        if (row.status !== VehicleDocumentStatus.CANCELLED) {
            await this.recomputeAndPersistStatus(id)
        }
        const fresh = assertFound(
            await this.prisma.vehicleDocument.findUnique({
                where: { id },
                include: includeVehicle,
            }),
            'Vehicle document not found',
        )
        return this.serialize(fresh)
    }

    async complianceSummary() {
        // Refresh a batch of active docs so counts stay honest without a cron
        const active = await this.prisma.vehicleDocument.findMany({
            where: { status: { not: VehicleDocumentStatus.CANCELLED } },
            select: {
                id: true,
                expiresAt: true,
                remindDaysBefore: true,
                status: true,
            },
            take: 1000,
        })
        for (const doc of active) {
            const next = deriveDocumentStatus(doc.expiresAt, doc.remindDaysBefore)
            if (next !== doc.status) {
                await this.prisma.vehicleDocument.update({
                    where: { id: doc.id },
                    data: { status: next },
                })
            }
        }

        const [expired, expiring, valid, cancelled] = await Promise.all([
            this.prisma.vehicleDocument.count({
                where: { status: VehicleDocumentStatus.EXPIRED },
            }),
            this.prisma.vehicleDocument.count({
                where: { status: VehicleDocumentStatus.EXPIRING_SOON },
            }),
            this.prisma.vehicleDocument.count({
                where: { status: VehicleDocumentStatus.VALID },
            }),
            this.prisma.vehicleDocument.count({
                where: { status: VehicleDocumentStatus.CANCELLED },
            }),
        ])

        return { expired, expiring, valid, cancelled }
    }

    /**
     * Highest-severity non-cancelled compliance flag for list badges.
     * EXPIRING_SOON = warn only; EXPIRED = also drives routingBlocked via sync.
     */
    async complianceAlertForVehicle(
        vehicleId: string,
    ): Promise<'EXPIRED' | 'EXPIRING_SOON' | null> {
        const docs = await this.prisma.vehicleDocument.findMany({
            where: {
                vehicleId,
                status: { not: VehicleDocumentStatus.CANCELLED },
            },
            select: {
                id: true,
                expiresAt: true,
                remindDaysBefore: true,
                status: true,
            },
        })
        let hasExpiring = false
        for (const doc of docs) {
            const status = deriveDocumentStatus(
                doc.expiresAt,
                doc.remindDaysBefore,
            )
            if (status !== doc.status) {
                await this.prisma.vehicleDocument.update({
                    where: { id: doc.id },
                    data: { status },
                })
            }
            if (status === VehicleDocumentStatus.EXPIRED) return 'EXPIRED'
            if (status === VehicleDocumentStatus.EXPIRING_SOON) {
                hasExpiring = true
            }
        }
        return hasExpiring ? 'EXPIRING_SOON' : null
    }

    async create(body: CreateDocumentBody) {
        const vehicleId = requireString(body.vehicleId, 'vehicleId')
        assertFound(
            await this.prisma.vehicle.findUnique({ where: { id: vehicleId } }),
            'Vehicle not found',
        )

        if (!body.kind || !DOC_KINDS.has(body.kind)) {
            throw new BadRequestException('Valid document kind is required')
        }

        const expiresAt = optionalDate(body.expiresAt)
        if (!expiresAt) {
            throw new BadRequestException('expiresAt is required')
        }

        const remindDaysBefore =
            optionalNumber(body.remindDaysBefore) ?? 30
        if (remindDaysBefore < 0) {
            throw new BadRequestException('remindDaysBefore must be >= 0')
        }

        const blocksVehicle =
            body.blocksVehicle !== undefined
                ? (optionalBoolean(body.blocksVehicle) ?? false)
                : defaultBlocksVehicle(body.kind)

        const status = deriveDocumentStatus(expiresAt, remindDaysBefore)

        const created = await this.prisma.vehicleDocument.create({
            data: {
                vehicleId,
                kind: body.kind,
                documentNo: requireString(body.documentNo, 'documentNo'),
                issuer: optionalString(body.issuer) ?? null,
                issuedAt: optionalDate(body.issuedAt) ?? null,
                expiresAt,
                coverageNote: optionalString(body.coverageNote) ?? null,
                fileUrl: optionalString(body.fileUrl) ?? null,
                remindDaysBefore,
                blocksVehicle,
                status,
                notes: optionalString(body.notes) ?? null,
            },
            include: includeVehicle,
        })

        await this.maintenanceService.syncVehicleRoutingBlock(vehicleId)
        return this.serialize(created)
    }

    async update(id: string, body: CreateDocumentBody) {
        const existing = await this.findOne(id)
        const data: Prisma.VehicleDocumentUpdateInput = {}

        if (body.kind !== undefined) {
            if (!DOC_KINDS.has(body.kind)) {
                throw new BadRequestException('Invalid document kind')
            }
            data.kind = body.kind
        }
        if (body.documentNo !== undefined) {
            data.documentNo = requireString(body.documentNo, 'documentNo')
        }
        if (body.issuer !== undefined) {
            data.issuer = optionalString(body.issuer) ?? null
        }
        if (body.issuedAt !== undefined) {
            data.issuedAt = optionalDate(body.issuedAt) ?? null
        }
        if (body.expiresAt !== undefined) {
            const expiresAt = optionalDate(body.expiresAt)
            if (!expiresAt) {
                throw new BadRequestException('expiresAt is required')
            }
            data.expiresAt = expiresAt
        }
        if (body.coverageNote !== undefined) {
            data.coverageNote = optionalString(body.coverageNote) ?? null
        }
        if (body.fileUrl !== undefined) {
            data.fileUrl = optionalString(body.fileUrl) ?? null
        }
        if (body.remindDaysBefore !== undefined) {
            const n = optionalNumber(body.remindDaysBefore)
            if (n == null || n < 0) {
                throw new BadRequestException('remindDaysBefore must be >= 0')
            }
            data.remindDaysBefore = n
        }
        if (body.blocksVehicle !== undefined) {
            data.blocksVehicle =
                optionalBoolean(body.blocksVehicle) ?? false
        }
        if (body.notes !== undefined) {
            data.notes = optionalString(body.notes) ?? null
        }

        if (body.status === VehicleDocumentStatus.CANCELLED) {
            data.status = VehicleDocumentStatus.CANCELLED
        } else if (body.status !== undefined) {
            if (!DOC_STATUSES.has(body.status)) {
                throw new BadRequestException('Invalid document status')
            }
            // Non-cancel statuses are always re-derived from dates
        }

        await this.prisma.vehicleDocument.update({ where: { id }, data })

        const refreshed = await this.prisma.vehicleDocument.findUnique({
            where: { id },
        })
        if (
            refreshed &&
            refreshed.status !== VehicleDocumentStatus.CANCELLED
        ) {
            const next = deriveDocumentStatus(
                refreshed.expiresAt,
                refreshed.remindDaysBefore,
            )
            if (next !== refreshed.status) {
                await this.prisma.vehicleDocument.update({
                    where: { id },
                    data: { status: next },
                })
            }
        }

        await this.maintenanceService.syncVehicleRoutingBlock(
            existing.vehicleId,
        )
        return this.findOne(id)
    }

    /** Soft-cancel (preferred over hard delete). */
    async cancel(id: string) {
        return this.update(id, { status: VehicleDocumentStatus.CANCELLED })
    }
}
