import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { nextSequentialCode } from '../shared/next-code'
import {
    CreateCountPolicyDto,
    UpdateCountPolicyDto,
    CountPolicyQueryDto,
} from './dto/count-engine.dto'

@Injectable()
export class CountPolicyService {
    constructor(private prisma: PrismaService) {}

    async findAll(query: CountPolicyQueryDto) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const where: Record<string, unknown> = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.abcClass) where.abcClass = query.abcClass
        if (query.isActive !== undefined) where.isActive = query.isActive

        const [data, total] = await Promise.all([
            this.prisma.mmCountPolicy.findMany({
                where,
                include: { warehouse: true, company: true },
                orderBy: [{ priority: 'asc' }, { code: 'asc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmCountPolicy.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const policy = await this.prisma.mmCountPolicy.findUnique({
            where: { id },
            include: { warehouse: true, company: true, legacyCountRule: true },
        })
        if (!policy) throw new NotFoundException('Count policy not found')
        return policy
    }

    async create(dto: CreateCountPolicyDto) {
        const code = dto.code?.trim() || (await this.nextCode())
        const existing = await this.prisma.mmCountPolicy.findUnique({ where: { code } })
        if (existing) throw new ConflictException('Count policy code already exists')

        const rule = await this.prisma.mmCountRule.create({
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
        })

        return this.prisma.mmCountPolicy.create({
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
                variancePctTolerance: new Decimal(dto.variancePctTolerance ?? 0),
                varianceValueTolerance: new Decimal(dto.varianceValueTolerance ?? 0),
                minUnitValue:
                    dto.minUnitValue !== undefined ? new Decimal(dto.minUnitValue) : null,
                maxUnitValue:
                    dto.maxUnitValue !== undefined ? new Decimal(dto.maxUnitValue) : null,
                blindCountRequired: dto.blindCountRequired ?? false,
                priority: dto.priority ?? 5,
                isActive: dto.isActive ?? true,
                legacyCountRuleId: rule.id,
            },
            include: { warehouse: true, company: true },
        })
    }

    async update(id: string, dto: UpdateCountPolicyDto) {
        const policy = await this.findOne(id)
        const data = {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.companyId !== undefined ? { companyId: dto.companyId } : {}),
            ...(dto.warehouseId !== undefined ? { warehouseId: dto.warehouseId } : {}),
            ...(dto.abcClass !== undefined ? { abcClass: dto.abcClass } : {}),
            ...(dto.velocityClass !== undefined ? { velocityClass: dto.velocityClass } : {}),
            ...(dto.riskClass !== undefined ? { riskClass: dto.riskClass } : {}),
            ...(dto.materialCategoryId !== undefined
                ? { materialCategoryId: dto.materialCategoryId }
                : {}),
            ...(dto.materialTypeId !== undefined ? { materialTypeId: dto.materialTypeId } : {}),
            ...(dto.frequencyDays !== undefined ? { frequencyDays: dto.frequencyDays } : {}),
            ...(dto.varianceQtyTolerance !== undefined
                ? { varianceQtyTolerance: new Decimal(dto.varianceQtyTolerance) }
                : {}),
            ...(dto.variancePctTolerance !== undefined
                ? { variancePctTolerance: new Decimal(dto.variancePctTolerance) }
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
            ...(dto.blindCountRequired !== undefined
                ? { blindCountRequired: dto.blindCountRequired }
                : {}),
            ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        }

        if (policy.legacyCountRuleId) {
            await this.prisma.mmCountRule.update({
                where: { id: policy.legacyCountRuleId },
                data: {
                    ...(dto.name !== undefined ? { name: dto.name } : {}),
                    ...(dto.frequencyDays !== undefined
                        ? { frequencyDays: dto.frequencyDays }
                        : {}),
                    ...(dto.abcClass !== undefined ? { abcClass: dto.abcClass } : {}),
                    ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
                    ...(dto.varianceQtyTolerance !== undefined
                        ? { varianceQtyTolerance: new Decimal(dto.varianceQtyTolerance) }
                        : {}),
                    ...(dto.varianceValueTolerance !== undefined
                        ? { varianceValueTolerance: new Decimal(dto.varianceValueTolerance) }
                        : {}),
                },
            })
        }

        return this.prisma.mmCountPolicy.update({
            where: { id },
            data,
            include: { warehouse: true, company: true },
        })
    }

    /** Bridge: ensure policy exists for a legacy rule */
    async ensureFromLegacyRule(ruleId: string) {
        const existing = await this.prisma.mmCountPolicy.findUnique({
            where: { legacyCountRuleId: ruleId },
        })
        if (existing) return existing
        const rule = await this.prisma.mmCountRule.findUnique({ where: { id: ruleId } })
        if (!rule) throw new BadRequestException('Count rule not found')
        return this.prisma.mmCountPolicy.create({
            data: {
                code: `POL-${rule.code}`,
                name: rule.name,
                companyId: rule.companyId,
                warehouseId: rule.warehouseId,
                abcClass: rule.abcClass,
                velocityClass: rule.velocityClass,
                riskClass: rule.riskClass,
                materialCategoryId: rule.materialCategoryId,
                materialTypeId: rule.materialTypeId,
                frequencyDays: rule.frequencyDays,
                varianceQtyTolerance: rule.varianceQtyTolerance,
                varianceValueTolerance: rule.varianceValueTolerance,
                minUnitValue: rule.minUnitValue,
                maxUnitValue: rule.maxUnitValue,
                priority: rule.priority,
                isActive: rule.isActive,
                legacyCountRuleId: rule.id,
            },
        })
    }

    private async nextCode() {
        const last = await this.prisma.mmCountPolicy.findFirst({
            where: { code: { startsWith: 'CP-' } },
            orderBy: { code: 'desc' },
            select: { code: true },
        })
        return nextSequentialCode(last?.code, 'CP-')
    }
}
