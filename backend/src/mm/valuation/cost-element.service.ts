import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
    DEFAULT_COST_ELEMENTS,
    LANDED_COST_TYPES,
} from './valuation.constants'

@Injectable()
export class CostElementService {
    constructor(private prisma: PrismaService) {}

    async findAll(query: {
        companyId?: string
        costType?: string
        isActive?: boolean
        page?: number
        limit?: number
    }) {
        const page = query.page ?? 1
        const limit = query.limit ?? 100
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.costType) where.costType = query.costType
        if (query.isActive !== undefined) where.isActive = query.isActive

        const [data, total] = await Promise.all([
            this.prisma.mmCostElement.findMany({
                where,
                orderBy: [{ costType: 'asc' }, { code: 'asc' }],
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmCostElement.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const row = await this.prisma.mmCostElement.findUnique({ where: { id } })
        if (!row) throw new NotFoundException('Cost element not found')
        return row
    }

    async upsert(dto: {
        companyId: string
        code: string
        name: string
        costType: string
        isActive?: boolean
    }) {
        if (!LANDED_COST_TYPES.includes(dto.costType as any)) {
            throw new BadRequestException(
                `Invalid costType. Allowed: ${LANDED_COST_TYPES.join(', ')}`,
            )
        }
        return this.prisma.mmCostElement.upsert({
            where: {
                companyId_code: {
                    companyId: dto.companyId,
                    code: dto.code,
                },
            },
            create: {
                companyId: dto.companyId,
                code: dto.code,
                name: dto.name,
                costType: dto.costType,
                isActive: dto.isActive ?? true,
            },
            update: {
                name: dto.name,
                costType: dto.costType,
                isActive: dto.isActive ?? undefined,
            },
        })
    }

    /** Seed default FREIGHT/INSURANCE/CUSTOMS/DUTY/HANDLING/OTHER for a company. */
    async ensureDefaults(companyId: string) {
        const created = []
        for (const el of DEFAULT_COST_ELEMENTS) {
            const row = await this.prisma.mmCostElement.upsert({
                where: {
                    companyId_code: { companyId, code: el.code },
                },
                create: {
                    companyId,
                    code: el.code,
                    name: el.name,
                    costType: el.costType,
                    isActive: true,
                },
                update: {},
            })
            created.push(row)
        }
        return created
    }
}
