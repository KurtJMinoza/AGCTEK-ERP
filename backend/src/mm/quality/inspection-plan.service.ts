import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateInspectionPlanDto, QualityQueryDto, UpdateInspectionPlanDto } from './dto/quality.dto'

@Injectable()
export class InspectionPlanService {
    constructor(private prisma: PrismaService) {}

    async findAll(query: QualityQueryDto) {
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.status) where.status = query.status
        if (query.search) {
            where.OR = [
                { planCode: { contains: query.search, mode: 'insensitive' } },
                { name: { contains: query.search, mode: 'insensitive' } },
            ]
        }
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.mmInspectionPlan.findMany({
                where,
                include: { characteristics: { orderBy: { lineNumber: 'asc' } } },
                orderBy: { planCode: 'asc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmInspectionPlan.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const plan = await this.prisma.mmInspectionPlan.findUnique({
            where: { id },
            include: { characteristics: { orderBy: { lineNumber: 'asc' } } },
        })
        if (!plan) throw new NotFoundException('Inspection plan not found')
        return plan
    }

    async create(dto: CreateInspectionPlanDto) {
        const existing = await this.prisma.mmInspectionPlan.findUnique({
            where: { planCode: dto.planCode },
        })
        if (existing) throw new BadRequestException('Plan code already exists')

        return this.prisma.mmInspectionPlan.create({
            data: {
                planCode: dto.planCode,
                name: dto.name,
                companyId: dto.companyId,
                materialCategoryId: dto.materialCategoryId ?? null,
                materialId: dto.materialId ?? null,
                supplierId: dto.supplierId ?? null,
                plantId: dto.plantId ?? null,
                inspectionType: dto.inspectionType ?? null,
                samplingType: dto.samplingType ?? 'FULL',
                sampleSize: dto.sampleSize ?? null,
                samplePercent: dto.samplePercent ?? null,
                allowFullInspection: dto.allowFullInspection ?? true,
                effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
                effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
                characteristics: dto.lines?.length
                    ? {
                          create: dto.lines.map((l, i) => ({
                              lineNumber: l.lineNumber ?? i + 1,
                              name: l.name,
                              valueType: l.valueType ?? 'NUMERIC',
                              toleranceMin: l.toleranceMin ?? null,
                              toleranceMax: l.toleranceMax ?? null,
                              required: l.required ?? true,
                              unit: l.unit ?? null,
                              targetValue: l.targetValue ?? null,
                              categoryLabel: l.categoryLabel ?? null,
                              allowedValues: l.allowedValues ?? undefined,
                          })),
                      }
                    : undefined,
            },
            include: { characteristics: { orderBy: { lineNumber: 'asc' } } },
        })
    }

    async update(id: string, dto: UpdateInspectionPlanDto) {
        await this.findOne(id)
        return this.prisma.$transaction(async (tx) => {
            if (dto.lines) {
                await tx.mmInspectionCharacteristic.deleteMany({ where: { planId: id } })
                if (dto.lines.length) {
                    await tx.mmInspectionCharacteristic.createMany({
                        data: dto.lines.map((l, i) => ({
                            planId: id,
                            lineNumber: l.lineNumber ?? i + 1,
                            name: l.name,
                            valueType: l.valueType ?? 'NUMERIC',
                            toleranceMin: l.toleranceMin ?? null,
                            toleranceMax: l.toleranceMax ?? null,
                            required: l.required ?? true,
                            unit: l.unit ?? null,
                            targetValue: l.targetValue ?? null,
                            categoryLabel: l.categoryLabel ?? null,
                            allowedValues: l.allowedValues ?? undefined,
                        })),
                    })
                }
            }
            return tx.mmInspectionPlan.update({
                where: { id },
                data: {
                    name: dto.name,
                    status: dto.status,
                    samplingType: dto.samplingType,
                    sampleSize: dto.sampleSize,
                    samplePercent: dto.samplePercent,
                    allowFullInspection: dto.allowFullInspection,
                    effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
                    effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
                },
                include: { characteristics: { orderBy: { lineNumber: 'asc' } } },
            })
        })
    }

    async remove(id: string) {
        await this.findOne(id)
        return this.prisma.mmInspectionPlan.update({
            where: { id },
            data: { status: 'INACTIVE' },
        })
    }

    /** Select best matching active plan for a lot context */
    async selectPlan(params: {
        companyId: string
        materialId: string
        materialCategoryId?: string | null
        supplierId?: string | null
        plantId?: string | null
    }) {
        const now = new Date()
        const plans = await this.prisma.mmInspectionPlan.findMany({
            where: {
                companyId: params.companyId,
                status: 'ACTIVE',
                OR: [
                    { materialId: params.materialId },
                    ...(params.materialCategoryId
                        ? [{ materialCategoryId: params.materialCategoryId, materialId: null }]
                        : []),
                    { materialId: null, materialCategoryId: null, supplierId: null, plantId: null },
                ],
            },
            include: { characteristics: { orderBy: { lineNumber: 'asc' } } },
        })

        const scored = plans
            .filter((p) => {
                if (p.effectiveFrom && p.effectiveFrom > now) return false
                if (p.effectiveTo && p.effectiveTo < now) return false
                if (p.supplierId && p.supplierId !== params.supplierId) return false
                if (p.plantId && p.plantId !== params.plantId) return false
                return true
            })
            .map((p) => {
                let score = 0
                if (p.materialId === params.materialId) score += 100
                if (p.materialCategoryId === params.materialCategoryId) score += 50
                if (p.supplierId === params.supplierId) score += 30
                if (p.plantId === params.plantId) score += 20
                return { plan: p, score }
            })
            .sort((a, b) => b.score - a.score)

        return scored[0]?.plan ?? null
    }
}
