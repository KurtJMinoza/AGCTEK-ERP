import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    CreateReorderRuleDto,
    UpdateReorderRuleDto,
    ReorderRuleQueryDto,
} from './dto/planning.dto'

export type ResolvedPlanningParams = {
    reorderPoint: Decimal
    safetyStock: Decimal
    reorderQuantity: Decimal
    minimumOrderQuantity: Decimal
    leadTimeDays: number
    source: 'RULE' | 'MATERIAL'
}

const RULE_INCLUDE = {
    material: {
        select: {
            id: true,
            materialCode: true,
            materialName: true,
            baseUomId: true,
            safetyStock: true,
            reorderPoint: true,
            reorderQuantity: true,
            minimumOrderQuantity: true,
            leadTimeDays: true,
        },
    },
    warehouse: { select: { id: true, code: true, name: true } },
    company: { select: { id: true, name: true } },
}

@Injectable()
export class ReorderRuleService {
    constructor(private prisma: PrismaService) {}

    async findAll(query: ReorderRuleQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 50
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.materialId) where.materialId = query.materialId
        if (query.warehouseId !== undefined) {
            where.warehouseId = query.warehouseId || null
        }
        if (query.isActive !== undefined) where.isActive = query.isActive

        const [data, total] = await Promise.all([
            this.prisma.mmReorderRule.findMany({
                where,
                include: RULE_INCLUDE,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmReorderRule.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const row = await this.prisma.mmReorderRule.findUnique({
            where: { id },
            include: RULE_INCLUDE,
        })
        if (!row) throw new NotFoundException('Reorder rule not found')
        return row
    }

    async create(dto: CreateReorderRuleDto) {
        const material = await this.prisma.mmMaterial.findUnique({
            where: { id: dto.materialId },
        })
        if (!material) throw new BadRequestException('Material not found')

        const warehouseId = dto.warehouseId ?? null
        const existing = await this.prisma.mmReorderRule.findFirst({
            where: {
                companyId: dto.companyId,
                materialId: dto.materialId,
                warehouseId,
            },
        })
        if (existing) {
            throw new ConflictException(
                'Reorder rule already exists for this material/warehouse',
            )
        }

        return this.prisma.mmReorderRule.create({
            data: {
                companyId: dto.companyId,
                materialId: dto.materialId,
                warehouseId,
                reorderPoint: new Decimal(dto.reorderPoint ?? 0),
                safetyStock: new Decimal(dto.safetyStock ?? 0),
                reorderQuantity: new Decimal(dto.reorderQuantity ?? 0),
                minimumOrderQuantity: new Decimal(dto.minimumOrderQuantity ?? 0),
                leadTimeDays: dto.leadTimeDays ?? 0,
                isActive: dto.isActive ?? true,
            },
            include: RULE_INCLUDE,
        })
    }

    async update(id: string, dto: UpdateReorderRuleDto) {
        await this.findOne(id)
        const data: any = {}
        if (dto.reorderPoint !== undefined) data.reorderPoint = new Decimal(dto.reorderPoint)
        if (dto.safetyStock !== undefined) data.safetyStock = new Decimal(dto.safetyStock)
        if (dto.reorderQuantity !== undefined)
            data.reorderQuantity = new Decimal(dto.reorderQuantity)
        if (dto.minimumOrderQuantity !== undefined)
            data.minimumOrderQuantity = new Decimal(dto.minimumOrderQuantity)
        if (dto.leadTimeDays !== undefined) data.leadTimeDays = dto.leadTimeDays
        if (dto.isActive !== undefined) data.isActive = dto.isActive

        return this.prisma.mmReorderRule.update({
            where: { id },
            data,
            include: RULE_INCLUDE,
        })
    }

    async remove(id: string) {
        await this.findOne(id)
        await this.prisma.mmReorderRule.delete({ where: { id } })
        return { deleted: true }
    }

    /**
     * Prefer warehouse-specific active rule, then company-wide (null warehouse), else material master.
     */
    async resolveParams(
        companyId: string,
        materialId: string,
        warehouseId: string,
        material?: {
            safetyStock: Decimal | number
            reorderPoint: Decimal | number
            reorderQuantity: Decimal | number
            minimumOrderQuantity: Decimal | number
            leadTimeDays: number
        },
    ): Promise<ResolvedPlanningParams> {
        const rules = await this.prisma.mmReorderRule.findMany({
            where: {
                companyId,
                materialId,
                isActive: true,
                OR: [{ warehouseId }, { warehouseId: null }],
            },
        })
        const whRule = rules.find((r) => r.warehouseId === warehouseId)
        const companyRule = rules.find((r) => r.warehouseId == null)
        const rule = whRule ?? companyRule
        if (rule) {
            return {
                reorderPoint: new Decimal(rule.reorderPoint),
                safetyStock: new Decimal(rule.safetyStock),
                reorderQuantity: new Decimal(rule.reorderQuantity),
                minimumOrderQuantity: new Decimal(rule.minimumOrderQuantity),
                leadTimeDays: rule.leadTimeDays,
                source: 'RULE',
            }
        }

        let mat = material
        if (!mat) {
            const row = await this.prisma.mmMaterial.findUnique({
                where: { id: materialId },
                select: {
                    safetyStock: true,
                    reorderPoint: true,
                    reorderQuantity: true,
                    minimumOrderQuantity: true,
                    leadTimeDays: true,
                },
            })
            if (!row) throw new NotFoundException('Material not found')
            mat = row
        }

        return {
            reorderPoint: new Decimal(mat.reorderPoint),
            safetyStock: new Decimal(mat.safetyStock),
            reorderQuantity: new Decimal(mat.reorderQuantity),
            minimumOrderQuantity: new Decimal(mat.minimumOrderQuantity),
            leadTimeDays: mat.leadTimeDays,
            source: 'MATERIAL',
        }
    }
}
