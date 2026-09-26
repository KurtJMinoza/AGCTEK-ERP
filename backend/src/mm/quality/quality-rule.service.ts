import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
    INSPECTION_RULE_ACTIONS,
    type InspectionRuleAction,
    PURCHASE_TYPES,
    RECEIPT_TYPES,
} from './quality.constants'
import {
    CreateInspectionRuleDto,
    QualityQueryDto,
    UpdateInspectionRuleDto,
} from './dto/quality.dto'

export type InspectionRuleContext = {
    companyId: string
    materialId: string
    supplierId?: string | null
    warehouseId: string
    materialCategoryId?: string | null
    supplierCategoryId?: string | null
    plantId?: string | null
    purchaseType?: string | null
    receiptType?: string | null
}

export type InspectionRequirementResult = {
    action: InspectionRuleAction
    inspectionRequired: boolean
    samplingOverride?: 'FULL' | 'FIXED' | 'PERCENTAGE'
    matchedRuleId: string | null
    matchedRuleCode: string | null
}

const NO_INSPECTION_RESULT: InspectionRequirementResult = {
    action: 'NO_INSPECTION',
    inspectionRequired: false,
    matchedRuleId: null,
    matchedRuleCode: null,
}

@Injectable()
export class QualityRuleService {
    constructor(private prisma: PrismaService) {}

    /** Build flat receiving context from document references. */
    async buildReceivingContext(params: {
        companyId: string
        materialId: string
        supplierId?: string | null
        warehouseId: string
        expectedReceiptId?: string | null
        purchaseOrderId?: string | null
    }): Promise<InspectionRuleContext> {
        const [material, warehouse, supplier, expectedReceipt, purchaseOrder] = await Promise.all([
            this.prisma.mmMaterial.findUnique({
                where: { id: params.materialId },
                select: { materialCategoryId: true },
            }),
            this.prisma.warehouse.findUnique({
                where: { id: params.warehouseId },
                select: { plantId: true },
            }),
            params.supplierId
                ? this.prisma.mmSupplier.findUnique({
                      where: { id: params.supplierId },
                      select: { categoryId: true },
                  })
                : Promise.resolve(null),
            params.expectedReceiptId
                ? this.prisma.mmExpectedReceipt.findUnique({
                      where: { id: params.expectedReceiptId },
                      select: { sourceType: true },
                  })
                : Promise.resolve(null),
            params.purchaseOrderId
                ? this.prisma.mmPurchaseOrder.findUnique({
                      where: { id: params.purchaseOrderId },
                      select: { purchaseContractId: true },
                  })
                : Promise.resolve(null),
        ])

        let purchaseType: string = 'NON_PO'
        if (purchaseOrder) {
            purchaseType = purchaseOrder.purchaseContractId ? 'CONTRACT' : 'PO'
        } else if (params.purchaseOrderId) {
            purchaseType = 'PO'
        }

        let receiptType: string = 'DIRECT'
        if (expectedReceipt?.sourceType) {
            receiptType = expectedReceipt.sourceType
        }

        return {
            companyId: params.companyId,
            materialId: params.materialId,
            supplierId: params.supplierId ?? null,
            warehouseId: params.warehouseId,
            materialCategoryId: material?.materialCategoryId ?? null,
            supplierCategoryId: supplier?.categoryId ?? null,
            plantId: warehouse?.plantId ?? null,
            purchaseType,
            receiptType,
        }
    }

    /** Deterministic rule resolution: priority DESC, ruleCode ASC tie-break. */
    resolveFromRules(
        rules: Array<{
            id: string
            ruleCode: string
            priority: number
            action: string
            materialId?: string | null
            materialCategoryId?: string | null
            supplierId?: string | null
            supplierCategoryId?: string | null
            plantId?: string | null
            warehouseId?: string | null
            purchaseType?: string | null
            receiptType?: string | null
        }>,
        context: InspectionRuleContext,
        now = new Date(),
    ): InspectionRequirementResult {
        const matches = rules
            .filter((rule) => this.ruleMatches(rule, context, now))
            .sort((a, b) => {
                if (b.priority !== a.priority) return b.priority - a.priority
                return a.ruleCode.localeCompare(b.ruleCode)
            })

        const winner = matches[0]
        if (!winner) return NO_INSPECTION_RESULT

        return this.toResult(winner.action as InspectionRuleAction, winner.id, winner.ruleCode)
    }

    async resolveInspectionRequirement(
        params: {
            companyId: string
            materialId: string
            supplierId?: string | null
            warehouseId: string
            expectedReceiptId?: string | null
            purchaseOrderId?: string | null
        } | InspectionRuleContext,
    ): Promise<InspectionRequirementResult> {
        const context =
            'receiptType' in params
                ? (params as InspectionRuleContext)
                : await this.buildReceivingContext(params)

        const now = new Date()
        const rules = await this.prisma.mmQualityInspectionRule.findMany({
            where: {
                companyId: context.companyId,
                active: true,
                OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }],
                AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] }],
            },
        })

        return this.resolveFromRules(rules, context, now)
    }

    private ruleMatches(
        rule: {
            materialId?: string | null
            materialCategoryId?: string | null
            supplierId?: string | null
            supplierCategoryId?: string | null
            plantId?: string | null
            warehouseId?: string | null
            purchaseType?: string | null
            receiptType?: string | null
            effectiveFrom?: Date | null
            effectiveTo?: Date | null
        },
        context: InspectionRuleContext,
        now: Date,
    ): boolean {
        if (rule.effectiveFrom && rule.effectiveFrom > now) return false
        if (rule.effectiveTo && rule.effectiveTo < now) return false

        const dimensions: Array<[string | null | undefined, string | null | undefined]> = [
            [rule.materialId, context.materialId],
            [rule.materialCategoryId, context.materialCategoryId],
            [rule.supplierId, context.supplierId],
            [rule.supplierCategoryId, context.supplierCategoryId],
            [rule.plantId, context.plantId],
            [rule.warehouseId, context.warehouseId],
            [rule.purchaseType, context.purchaseType],
            [rule.receiptType, context.receiptType],
        ]

        return dimensions.every(([ruleVal, ctxVal]) => {
            if (ruleVal == null || ruleVal === '') return true
            return ruleVal === ctxVal
        })
    }

    private toResult(
        action: InspectionRuleAction,
        matchedRuleId: string,
        matchedRuleCode: string,
    ): InspectionRequirementResult {
        const inspectionRequired = action !== 'NO_INSPECTION'
        let samplingOverride: 'FULL' | 'FIXED' | 'PERCENTAGE' | undefined

        if (action === 'FULL_INSPECTION') {
            samplingOverride = 'FULL'
        } else if (action === 'SAMPLE_INSPECTION') {
            samplingOverride = 'PERCENTAGE'
        }

        return {
            action,
            inspectionRequired,
            samplingOverride,
            matchedRuleId,
            matchedRuleCode,
        }
    }

    // ── CRUD ──

    async findAll(query: QualityQueryDto) {
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.status === 'inactive') {
            where.active = false
        } else if (query.status !== 'all') {
            where.active = true
        }
        if (query.search) {
            where.OR = [
                { ruleCode: { contains: query.search, mode: 'insensitive' } },
                { name: { contains: query.search, mode: 'insensitive' } },
            ]
        }
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 50
        const [data, total] = await Promise.all([
            this.prisma.mmQualityInspectionRule.findMany({
                where,
                orderBy: [{ priority: 'desc' }, { ruleCode: 'asc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmQualityInspectionRule.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const rule = await this.prisma.mmQualityInspectionRule.findUnique({ where: { id } })
        if (!rule) throw new NotFoundException('Inspection rule not found')
        return rule
    }

    async create(dto: CreateInspectionRuleDto) {
        this.validateRuleDto(dto)
        const existing = await this.prisma.mmQualityInspectionRule.findFirst({
            where: { companyId: dto.companyId, ruleCode: dto.ruleCode },
        })
        if (existing) throw new BadRequestException('Rule code already exists for this company')

        return this.prisma.mmQualityInspectionRule.create({
            data: {
                companyId: dto.companyId,
                ruleCode: dto.ruleCode.toUpperCase(),
                name: dto.name,
                priority: dto.priority ?? 0,
                active: dto.active ?? true,
                effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
                effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
                materialId: dto.materialId ?? null,
                materialCategoryId: dto.materialCategoryId ?? null,
                supplierId: dto.supplierId ?? null,
                supplierCategoryId: dto.supplierCategoryId ?? null,
                plantId: dto.plantId ?? null,
                warehouseId: dto.warehouseId ?? null,
                purchaseType: dto.purchaseType ?? null,
                receiptType: dto.receiptType ?? null,
                action: dto.action,
            },
        })
    }

    async update(id: string, dto: UpdateInspectionRuleDto) {
        await this.findOne(id)
        if (dto.action) this.assertValidAction(dto.action)
        if (dto.purchaseType) this.assertIn(dto.purchaseType, PURCHASE_TYPES, 'purchaseType')
        if (dto.receiptType) this.assertIn(dto.receiptType, RECEIPT_TYPES, 'receiptType')

        return this.prisma.mmQualityInspectionRule.update({
            where: { id },
            data: {
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.priority !== undefined && { priority: dto.priority }),
                ...(dto.active !== undefined && { active: dto.active }),
                ...(dto.effectiveFrom !== undefined && {
                    effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
                }),
                ...(dto.effectiveTo !== undefined && {
                    effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
                }),
                ...(dto.materialId !== undefined && { materialId: dto.materialId || null }),
                ...(dto.materialCategoryId !== undefined && {
                    materialCategoryId: dto.materialCategoryId || null,
                }),
                ...(dto.supplierId !== undefined && { supplierId: dto.supplierId || null }),
                ...(dto.supplierCategoryId !== undefined && {
                    supplierCategoryId: dto.supplierCategoryId || null,
                }),
                ...(dto.plantId !== undefined && { plantId: dto.plantId || null }),
                ...(dto.warehouseId !== undefined && { warehouseId: dto.warehouseId || null }),
                ...(dto.purchaseType !== undefined && { purchaseType: dto.purchaseType || null }),
                ...(dto.receiptType !== undefined && { receiptType: dto.receiptType || null }),
                ...(dto.action !== undefined && { action: dto.action }),
            },
        })
    }

    async remove(id: string) {
        await this.findOne(id)
        return this.prisma.mmQualityInspectionRule.update({
            where: { id },
            data: { active: false },
        })
    }

    /** Re-seed legacy boolean flags into rules for a company (idempotent). */
    async seedLegacyFlags(companyId: string) {
        const [materials, warehouses, suppliers, supplierMaterials] = await Promise.all([
            this.prisma.mmMaterial.findMany({
                where: { companyId, qualityInspectionRequired: true },
                select: { id: true, materialCode: true },
            }),
            this.prisma.warehouse.findMany({
                where: { companyId, qualityInspectionRequired: true },
                select: { id: true, code: true },
            }),
            this.prisma.mmSupplier.findMany({
                where: { companyId, qualityInspectionRequired: true },
                select: { id: true, supplierCode: true },
            }),
            this.prisma.mmSupplierMaterial.findMany({
                where: { supplier: { companyId }, inspectionRequired: true, status: 'ACTIVE' },
                include: {
                    supplier: { select: { supplierCode: true, companyId: true } },
                    material: { select: { materialCode: true } },
                },
            }),
        ])

        let created = 0
        for (const m of materials) {
            const ruleCode = `SEED-MAT-${m.materialCode}`
            const exists = await this.prisma.mmQualityInspectionRule.findFirst({
                where: { companyId, ruleCode },
            })
            if (!exists) {
                await this.prisma.mmQualityInspectionRule.create({
                    data: {
                        companyId,
                        ruleCode,
                        name: `Seeded: material ${m.materialCode} requires inspection`,
                        priority: 100,
                        materialId: m.id,
                        action: 'INSPECTION_REQUIRED',
                    },
                })
                created++
            }
        }
        for (const w of warehouses) {
            const ruleCode = `SEED-WH-${w.code}`
            const exists = await this.prisma.mmQualityInspectionRule.findFirst({
                where: { companyId, ruleCode },
            })
            if (!exists) {
                await this.prisma.mmQualityInspectionRule.create({
                    data: {
                        companyId,
                        ruleCode,
                        name: `Seeded: warehouse ${w.code} requires inspection`,
                        priority: 90,
                        warehouseId: w.id,
                        action: 'INSPECTION_REQUIRED',
                    },
                })
                created++
            }
        }
        for (const s of suppliers) {
            const ruleCode = `SEED-SUP-${s.supplierCode}`
            const exists = await this.prisma.mmQualityInspectionRule.findFirst({
                where: { companyId, ruleCode },
            })
            if (!exists) {
                await this.prisma.mmQualityInspectionRule.create({
                    data: {
                        companyId,
                        ruleCode,
                        name: `Seeded: supplier ${s.supplierCode} requires inspection`,
                        priority: 80,
                        supplierId: s.id,
                        action: 'INSPECTION_REQUIRED',
                    },
                })
                created++
            }
        }
        for (const sm of supplierMaterials) {
            const ruleCode = `SEED-SM-${sm.supplier.supplierCode}-${sm.material.materialCode}`
            const exists = await this.prisma.mmQualityInspectionRule.findFirst({
                where: { companyId: sm.supplier.companyId, ruleCode },
            })
            if (!exists) {
                await this.prisma.mmQualityInspectionRule.create({
                    data: {
                        companyId: sm.supplier.companyId,
                        ruleCode,
                        name: `Seeded: supplier-material ${sm.supplier.supplierCode}/${sm.material.materialCode}`,
                        priority: 110,
                        supplierId: sm.supplierId,
                        materialId: sm.materialId,
                        action: 'INSPECTION_REQUIRED',
                    },
                })
                created++
            }
        }
        return { created }
    }

    private validateRuleDto(dto: CreateInspectionRuleDto) {
        this.assertValidAction(dto.action)
        if (dto.purchaseType) this.assertIn(dto.purchaseType, PURCHASE_TYPES, 'purchaseType')
        if (dto.receiptType) this.assertIn(dto.receiptType, RECEIPT_TYPES, 'receiptType')
    }

    private assertValidAction(action: string) {
        if (!INSPECTION_RULE_ACTIONS.includes(action as InspectionRuleAction)) {
            throw new BadRequestException(`Invalid action: ${action}`)
        }
    }

    private assertIn(value: string, allowed: readonly string[], field: string) {
        if (!allowed.includes(value)) {
            throw new BadRequestException(`Invalid ${field}: ${value}`)
        }
    }
}
