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
    minStock: Decimal
    maxStock: Decimal
    lotSize: Decimal
    reviewPeriodDays: number
    planningHorizonDays: number | null
    planningStrategy: string
    procurementType: string
    leadTimeDays: number
    source: 'RULE' | 'MATERIAL'
}

export function isRuleEffective(
    rule: { effectiveFrom: Date | null; effectiveTo: Date | null },
    asOf: Date,
): boolean {
    if (rule.effectiveFrom && asOf.getTime() < rule.effectiveFrom.getTime()) return false
    if (rule.effectiveTo && asOf.getTime() > rule.effectiveTo.getTime()) return false
    return true
}

type RuleRow = {
    warehouseId: string | null
    reorderPoint: Decimal | number
    safetyStock: Decimal | number
    reorderQuantity: Decimal | number
    minimumOrderQuantity: Decimal | number
    minStock?: Decimal | number | null
    maxStock?: Decimal | number | null
    lotSize?: Decimal | number | null
    reviewPeriodDays?: number | null
    planningHorizonDays?: number | null
    planningStrategy?: string | null
    procurementType?: string | null
    leadTimeDays: number
    effectiveFrom?: Date | null
    effectiveTo?: Date | null
}

/** Pure resolver for preloaded rules (Phase 2B batched scope). */
export function resolveParamsFromRules(
    rules: RuleRow[],
    warehouseId: string,
    material: {
        safetyStock: Decimal | number
        reorderPoint: Decimal | number
        reorderQuantity: Decimal | number
        minimumOrderQuantity: Decimal | number
        leadTimeDays: number
    },
    asOf: Date = new Date(),
): ResolvedPlanningParams {
    const effective = rules.filter((r) =>
        isRuleEffective(
            { effectiveFrom: r.effectiveFrom ?? null, effectiveTo: r.effectiveTo ?? null },
            asOf,
        ),
    )
    const whRule = effective.find((r) => r.warehouseId === warehouseId)
    const companyRule = effective.find((r) => r.warehouseId == null)
    const rule = whRule ?? companyRule
    if (rule) {
        return {
            reorderPoint: new Decimal(rule.reorderPoint),
            safetyStock: new Decimal(rule.safetyStock),
            reorderQuantity: new Decimal(rule.reorderQuantity),
            minimumOrderQuantity: new Decimal(rule.minimumOrderQuantity),
            minStock: new Decimal(rule.minStock ?? 0),
            maxStock: new Decimal(rule.maxStock ?? 0),
            lotSize: new Decimal(rule.lotSize ?? 0),
            reviewPeriodDays: rule.reviewPeriodDays ?? 0,
            planningHorizonDays: rule.planningHorizonDays ?? null,
            planningStrategy: rule.planningStrategy ?? 'REORDER_POINT',
            procurementType: rule.procurementType ?? 'BUY',
            leadTimeDays: rule.leadTimeDays,
            source: 'RULE',
        }
    }
    return {
        reorderPoint: new Decimal(material.reorderPoint),
        safetyStock: new Decimal(material.safetyStock),
        reorderQuantity: new Decimal(material.reorderQuantity),
        minimumOrderQuantity: new Decimal(material.minimumOrderQuantity),
        minStock: new Decimal(0),
        maxStock: new Decimal(0),
        lotSize: new Decimal(0),
        reviewPeriodDays: 0,
        planningHorizonDays: null,
        planningStrategy: 'REORDER_POINT',
        procurementType: 'BUY',
        leadTimeDays: material.leadTimeDays,
        source: 'MATERIAL',
    }
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
                plantId: dto.plantId ?? null,
                reorderPoint: new Decimal(dto.reorderPoint ?? 0),
                safetyStock: new Decimal(dto.safetyStock ?? 0),
                reorderQuantity: new Decimal(dto.reorderQuantity ?? 0),
                minimumOrderQuantity: new Decimal(dto.minimumOrderQuantity ?? 0),
                minStock: new Decimal(dto.minStock ?? 0),
                maxStock: new Decimal(dto.maxStock ?? 0),
                lotSize: new Decimal(dto.lotSize ?? 0),
                leadTimeDays: dto.leadTimeDays ?? 0,
                reviewPeriodDays: dto.reviewPeriodDays ?? 0,
                planningHorizonDays: dto.planningHorizonDays ?? null,
                effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
                effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
                planningStrategy: dto.planningStrategy ?? 'REORDER_POINT',
                procurementType: dto.procurementType ?? 'BUY',
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
        if (dto.minStock !== undefined) data.minStock = new Decimal(dto.minStock)
        if (dto.maxStock !== undefined) data.maxStock = new Decimal(dto.maxStock)
        if (dto.lotSize !== undefined) data.lotSize = new Decimal(dto.lotSize)
        if (dto.leadTimeDays !== undefined) data.leadTimeDays = dto.leadTimeDays
        if (dto.reviewPeriodDays !== undefined)
            data.reviewPeriodDays = dto.reviewPeriodDays
        if (dto.plantId !== undefined) data.plantId = dto.plantId || null
        if (dto.planningHorizonDays !== undefined)
            data.planningHorizonDays = dto.planningHorizonDays ?? null
        if (dto.effectiveFrom !== undefined)
            data.effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : null
        if (dto.effectiveTo !== undefined)
            data.effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null
        if (dto.planningStrategy !== undefined)
            data.planningStrategy = dto.planningStrategy
        if (dto.procurementType !== undefined)
            data.procurementType = dto.procurementType
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
        asOf: Date = new Date(),
    ): Promise<ResolvedPlanningParams> {
        const rules = await this.prisma.mmReorderRule.findMany({
            where: {
                companyId,
                materialId,
                isActive: true,
                OR: [{ warehouseId }, { warehouseId: null }],
            },
        })

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

        return resolveParamsFromRules(rules, warehouseId, mat, asOf)
    }
}
