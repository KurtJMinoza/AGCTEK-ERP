import {
    BadRequestException,
    ConflictException,
    Injectable,
} from '@nestjs/common'
import { CarrierIntegrationType, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    assertFound,
    optionalBoolean,
    optionalString,
    parsePagination,
    requireString,
    type ListQuery,
    type PaginatedResult,
} from '../scm.utils'
import {
    normalizeCarrierCode,
    validateTrackingUrlTemplate,
} from './couriers.rules'

type CarrierBody = {
    code?: string
    name?: string
    isActive?: boolean | string
    supportsCod?: boolean | string
    integrationType?: string
    trackingUrlTemplate?: string | null
    notes?: string | null
}

export type CarrierListQuery = ListQuery & { isActive?: string }

function parseIntegrationType(value: unknown): CarrierIntegrationType {
    if (value == null || value === '') return CarrierIntegrationType.MANUAL
    if (value === CarrierIntegrationType.MANUAL) return value
    if (value === CarrierIntegrationType.API) {
        // No carrier adapter exists yet (Phase 4) — an API carrier could never book or track.
        throw new BadRequestException(
            'API integration is not available yet — use MANUAL',
        )
    }
    throw new BadRequestException('integrationType must be MANUAL or API')
}

function isUniqueViolation(err: unknown): boolean {
    return (
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
    )
}

@Injectable()
export class CarriersService {
    constructor(private readonly prisma: PrismaService) {}

    async findAll(query: CarrierListQuery): Promise<PaginatedResult<unknown>> {
        const { page, pageSize, skip } = parsePagination(query)
        const where: Prisma.CarrierWhereInput = {}
        const isActive = optionalBoolean(query.isActive)
        if (isActive !== undefined) where.isActive = isActive
        if (query.search?.trim()) {
            const q = query.search.trim()
            where.OR = [
                { code: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
            ]
        }
        const [data, total] = await this.prisma.$transaction([
            this.prisma.carrier.findMany({
                where,
                orderBy: { name: 'asc' },
                skip,
                take: pageSize,
                include: { _count: { select: { consignments: true } } },
            }),
            this.prisma.carrier.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return assertFound(
            await this.prisma.carrier.findUnique({
                where: { id },
                include: { _count: { select: { consignments: true } } },
            }),
            'Carrier not found',
        )
    }

    async create(body: CarrierBody) {
        try {
            return await this.prisma.carrier.create({
                data: {
                    code: normalizeCarrierCode(body.code),
                    name: requireString(body.name, 'name'),
                    isActive: optionalBoolean(body.isActive) ?? true,
                    supportsCod: optionalBoolean(body.supportsCod) ?? false,
                    integrationType: parseIntegrationType(body.integrationType),
                    trackingUrlTemplate: validateTrackingUrlTemplate(
                        body.trackingUrlTemplate,
                    ),
                    notes: optionalString(body.notes) ?? null,
                },
            })
        } catch (err) {
            if (isUniqueViolation(err)) {
                throw new ConflictException('A carrier with this code already exists')
            }
            throw err
        }
    }

    async update(id: string, body: CarrierBody) {
        await this.findOne(id)
        const data: Prisma.CarrierUpdateInput = {}
        if (body.code !== undefined) data.code = normalizeCarrierCode(body.code)
        if (body.name !== undefined) data.name = requireString(body.name, 'name')
        const isActive = optionalBoolean(body.isActive)
        if (isActive !== undefined) data.isActive = isActive
        const supportsCod = optionalBoolean(body.supportsCod)
        if (supportsCod !== undefined) data.supportsCod = supportsCod
        if (body.integrationType !== undefined) {
            data.integrationType = parseIntegrationType(body.integrationType)
        }
        if (body.trackingUrlTemplate !== undefined) {
            data.trackingUrlTemplate = validateTrackingUrlTemplate(
                body.trackingUrlTemplate,
            )
        }
        if (body.notes !== undefined) {
            data.notes = optionalString(body.notes) ?? null
        }
        try {
            return await this.prisma.carrier.update({ where: { id }, data })
        } catch (err) {
            if (isUniqueViolation(err)) {
                throw new ConflictException('A carrier with this code already exists')
            }
            throw err
        }
    }

    async remove(id: string) {
        const carrier = await this.findOne(id)
        if (carrier._count.consignments > 0) {
            throw new ConflictException(
                'Carrier has consignments — deactivate it instead of deleting',
            )
        }
        await this.prisma.carrier.delete({ where: { id } })
        return { ok: true }
    }
}
