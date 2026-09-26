import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    assertFound,
    optionalDate,
    optionalString,
    parsePagination,
    requireNumber,
    requireString,
    type ListQuery,
    type PaginatedResult,
} from '../scm.utils'

type CreateForecastBody = {
    productCode?: string
    locationCode?: string
    periodStart?: string | Date
    periodEnd?: string | Date
    quantity?: number
    unit?: string | null
    source?: string | null
}

@Injectable()
export class ForecastsService {
    constructor(private readonly prisma: PrismaService) {}

    async findAll(query: ListQuery): Promise<PaginatedResult<unknown>> {
        const { page, pageSize, skip } = parsePagination(query)
        const where: Prisma.DemandForecastWhereInput = {}

        if (query.search?.trim()) {
            const q = query.search.trim()
            where.OR = [
                { productCode: { contains: q, mode: 'insensitive' } },
                { locationCode: { contains: q, mode: 'insensitive' } },
                { source: { contains: q, mode: 'insensitive' } },
            ]
        }

        const [data, total] = await this.prisma.$transaction([
            this.prisma.demandForecast.findMany({
                where,
                orderBy: [{ periodStart: 'desc' }, { productCode: 'asc' }],
                skip,
                take: pageSize,
            }),
            this.prisma.demandForecast.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async create(body: CreateForecastBody) {
        const periodStart = requireDate(body.periodStart, 'periodStart')
        const periodEnd = requireDate(body.periodEnd, 'periodEnd')
        if (periodEnd.getTime() < periodStart.getTime()) {
            throw new BadRequestException('periodEnd must be on or after periodStart')
        }

        const quantity = requireNumber(body.quantity, 'quantity')
        if (quantity < 0) {
            throw new BadRequestException('quantity must be >= 0')
        }

        return this.prisma.demandForecast.create({
            data: {
                productCode: requireString(body.productCode, 'productCode'),
                locationCode: requireString(body.locationCode, 'locationCode'),
                periodStart,
                periodEnd,
                quantity,
                unit: optionalString(body.unit) || 'EA',
                source: optionalString(body.source) ?? null,
            },
        })
    }

    async remove(id: string) {
        await assertFound(
            await this.prisma.demandForecast.findUnique({ where: { id } }),
            'Forecast not found',
        )
        await this.prisma.demandForecast.delete({ where: { id } })
        return { ok: true }
    }
}

function requireDate(value: unknown, field: string): Date {
    const parsed = optionalDate(value)
    if (!parsed) {
        throw new BadRequestException(`${field} is required`)
    }
    return parsed
}
