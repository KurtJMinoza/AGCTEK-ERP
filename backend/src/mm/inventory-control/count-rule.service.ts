import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    CreateCountRuleDto,
    UpdateCountRuleDto,
    CountRuleQueryDto,
} from './dto/inventory-control.dto'
import { nextSequentialCode } from '../shared/next-code'

@Injectable()
export class CountRuleService {
    constructor(private prisma: PrismaService) {}

    async findAll(query: CountRuleQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 20
        const where: any = {}
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.abcClass) where.abcClass = query.abcClass
        if (query.isActive !== undefined) where.isActive = query.isActive

        const [data, total] = await Promise.all([
            this.prisma.mmCountRule.findMany({
                where,
                include: { warehouse: true, company: true },
                orderBy: [{ priority: 'asc' }, { code: 'asc' }],
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmCountRule.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const rule = await this.prisma.mmCountRule.findUnique({
            where: { id },
            include: { warehouse: true, company: true },
        })
        if (!rule) throw new NotFoundException('Count rule not found')
        return rule
    }

    async create(dto: CreateCountRuleDto) {
        const code = dto.code?.trim() || (await this.generateNextCode())
        const existing = await this.prisma.mmCountRule.findUnique({
            where: { code },
        })
        if (existing) throw new ConflictException('Count rule code already exists')

        return this.prisma.mmCountRule.create({
            data: {
                code,
                name: dto.name,
                companyId: dto.companyId ?? null,
                warehouseId: dto.warehouseId ?? null,
                abcClass: dto.abcClass ?? null,
                velocityClass: dto.velocityClass ?? null,
                riskClass: dto.riskClass ?? null,
                materialCategoryId: dto.materialCategoryId ?? null,
                materialTypeId: dto.materialTypeId ?? null,
                frequencyDays: dto.frequencyDays ?? 30,
                varianceQtyTolerance: new Decimal(dto.varianceQtyTolerance ?? 0),
                varianceValueTolerance: new Decimal(dto.varianceValueTolerance ?? 0),
                minUnitValue:
                    dto.minUnitValue !== undefined ? new Decimal(dto.minUnitValue) : null,
                maxUnitValue:
                    dto.maxUnitValue !== undefined ? new Decimal(dto.maxUnitValue) : null,
                priority: dto.priority ?? 5,
                isActive: dto.isActive ?? true,
            },
            include: { warehouse: true, company: true },
        })
    }

    private async generateNextCode(): Promise<string> {
        const last = await this.prisma.mmCountRule.findFirst({
            where: { code: { startsWith: 'CR-' } },
            orderBy: { code: 'desc' },
            select: { code: true },
        })
        return nextSequentialCode(last?.code, 'CR-')
    }

    async update(id: string, dto: UpdateCountRuleDto) {
        await this.findOne(id)
        return this.prisma.mmCountRule.update({
            where: { id },
            data: {
                ...(dto.name !== undefined ? { name: dto.name } : {}),
                ...(dto.warehouseId !== undefined ? { warehouseId: dto.warehouseId } : {}),
                ...(dto.abcClass !== undefined ? { abcClass: dto.abcClass } : {}),
                ...(dto.velocityClass !== undefined
                    ? { velocityClass: dto.velocityClass }
                    : {}),
                ...(dto.riskClass !== undefined ? { riskClass: dto.riskClass } : {}),
                ...(dto.materialCategoryId !== undefined
                    ? { materialCategoryId: dto.materialCategoryId }
                    : {}),
                ...(dto.materialTypeId !== undefined
                    ? { materialTypeId: dto.materialTypeId }
                    : {}),
                ...(dto.frequencyDays !== undefined
                    ? { frequencyDays: dto.frequencyDays }
                    : {}),
                ...(dto.varianceQtyTolerance !== undefined
                    ? { varianceQtyTolerance: new Decimal(dto.varianceQtyTolerance) }
                    : {}),
                ...(dto.varianceValueTolerance !== undefined
                    ? { varianceValueTolerance: new Decimal(dto.varianceValueTolerance) }
                    : {}),
                ...(dto.minUnitValue !== undefined
                    ? { minUnitValue: new Decimal(dto.minUnitValue) }
                    : {}),
                ...(dto.maxUnitValue !== undefined
                    ? { maxUnitValue: new Decimal(dto.maxUnitValue) }
                    : {}),
                ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
                ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            },
            include: { warehouse: true, company: true },
        })
    }

    async remove(id: string) {
        await this.findOne(id)
        const inUse = await this.prisma.mmInventoryCount.count({
            where: { ruleId: id, status: { notIn: ['CLOSED', 'POSTED'] } },
        })
        if (inUse > 0) {
            throw new BadRequestException('Cannot delete rule used by open count sessions')
        }
        return this.prisma.mmCountRule.delete({ where: { id } })
    }
}
