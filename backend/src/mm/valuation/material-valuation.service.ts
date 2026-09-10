import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    UpsertMaterialValuationDto,
    UpdateMaterialValuationDto,
    ReviseStandardCostDto,
    MaterialValuationQueryDto,
} from './dto/valuation.dto'
import { ValuationEngineService } from './valuation-engine.service'

const SUPPORTED = new Set(['STANDARD_COST', 'MOVING_AVERAGE', 'FIFO'])

@Injectable()
export class MaterialValuationService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => ValuationEngineService))
        private valuationEngine: ValuationEngineService,
    ) {}

    async findAll(query: MaterialValuationQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 20
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.materialId) where.materialId = query.materialId
        if (query.valuationMethod) where.valuationMethod = query.valuationMethod

        const [data, total] = await Promise.all([
            this.prisma.mmMaterialValuation.findMany({
                where,
                include: {
                    material: true,
                    warehouse: true,
                    currency: true,
                },
                orderBy: { updatedAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmMaterialValuation.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const row = await this.prisma.mmMaterialValuation.findUnique({
            where: { id },
            include: { material: true, warehouse: true, currency: true },
        })
        if (!row) throw new NotFoundException('Material valuation not found')
        return row
    }

    async upsert(dto: UpsertMaterialValuationDto) {
        this.assertMethod(dto.valuationMethod)
        const material = await this.prisma.mmMaterial.findFirst({
            where: { id: dto.materialId, deletedAt: null },
        })
        if (!material) throw new BadRequestException('Material not found')

        const standardCost = new Decimal(
            dto.standardCost ?? material.standardCost ?? 0,
        )
        const effectiveDate = dto.effectiveDate
            ? new Date(dto.effectiveDate)
            : new Date()

        return this.prisma.mmMaterialValuation.upsert({
            where: {
                companyId_materialId_warehouseId: {
                    companyId: dto.companyId,
                    materialId: dto.materialId,
                    warehouseId: dto.warehouseId,
                },
            },
            create: {
                companyId: dto.companyId,
                materialId: dto.materialId,
                warehouseId: dto.warehouseId,
                currencyId: dto.currencyId ?? material.currencyId ?? null,
                valuationMethod: dto.valuationMethod,
                standardCost,
                movingAverageCost: 0,
                effectiveDate,
                revision: 1,
            },
            update: {
                valuationMethod: dto.valuationMethod,
                currencyId: dto.currencyId ?? undefined,
                standardCost:
                    dto.standardCost !== undefined ? standardCost : undefined,
                effectiveDate: dto.effectiveDate ? effectiveDate : undefined,
            },
            include: { material: true, warehouse: true, currency: true },
        })
    }

    async update(id: string, dto: UpdateMaterialValuationDto) {
        await this.findOne(id)
        if (dto.valuationMethod) this.assertMethod(dto.valuationMethod)

        return this.prisma.mmMaterialValuation.update({
            where: { id },
            data: {
                valuationMethod: dto.valuationMethod,
                currencyId:
                    dto.currencyId === undefined ? undefined : dto.currencyId,
                standardCost:
                    dto.standardCost !== undefined
                        ? new Decimal(dto.standardCost)
                        : undefined,
                effectiveDate: dto.effectiveDate
                    ? new Date(dto.effectiveDate)
                    : undefined,
            },
            include: { material: true, warehouse: true, currency: true },
        })
    }

    async reviseStandard(id: string, dto: ReviseStandardCostDto) {
        const row = await this.findOne(id)
        const oldCost = new Decimal(row.standardCost)
        const nextRevision = row.revision + 1
        const effectiveDate = dto.effectiveDate
            ? new Date(dto.effectiveDate)
            : new Date()
        const standardCost = new Decimal(dto.standardCost)

        await this.prisma.mmStandardCostRevision.create({
            data: {
                companyId: row.companyId,
                materialId: row.materialId,
                warehouseId: row.warehouseId,
                standardCost,
                effectiveDate,
                revision: nextRevision,
                createdBy: dto.createdBy ?? null,
            },
        })

        const updated = await this.prisma.mmMaterialValuation.update({
            where: { id },
            data: {
                standardCost,
                effectiveDate,
                revision: nextRevision,
                valuationMethod: 'STANDARD_COST',
            },
            include: { material: true, warehouse: true, currency: true },
        })

        // Append-only on-hand revaluation (does not mutate historical val txns)
        await this.valuationEngine.applyRevaluation({
            companyId: row.companyId,
            warehouseId: row.warehouseId,
            materialId: row.materialId,
            oldStandardCost: oldCost,
            newStandardCost: standardCost,
            postingDate: effectiveDate,
        })

        return updated
    }

    /**
     * Ensure a valuation row exists for posting. Syncs method from material master.
     */
    async ensureForPosting(
        companyId: string,
        materialId: string,
        warehouseId: string,
        tx?: any,
    ) {
        const db = tx ?? this.prisma
        const existing = await db.mmMaterialValuation.findUnique({
            where: {
                companyId_materialId_warehouseId: {
                    companyId,
                    materialId,
                    warehouseId,
                },
            },
        })
        if (existing) {
            if (!SUPPORTED.has(existing.valuationMethod)) {
                throw new BadRequestException(
                    `Unsupported valuation method: ${existing.valuationMethod}. Use STANDARD_COST, MOVING_AVERAGE, or FIFO.`,
                )
            }
            return existing
        }

        const material = await db.mmMaterial.findUnique({
            where: { id: materialId },
        })
        if (!material) throw new BadRequestException('Material not found')

        let method = material.valuationMethod || 'MOVING_AVERAGE'
        if (method === 'LIFO') {
            throw new BadRequestException(
                'LIFO is not supported for inventory valuation. Use STANDARD_COST, MOVING_AVERAGE, or FIFO.',
            )
        }
        if (!SUPPORTED.has(method)) {
            method = 'MOVING_AVERAGE'
        }

        return db.mmMaterialValuation.create({
            data: {
                companyId,
                materialId,
                warehouseId,
                currencyId: material.currencyId ?? null,
                valuationMethod: method,
                standardCost: material.standardCost ?? 0,
                movingAverageCost: 0,
                effectiveDate: new Date(),
                revision: 1,
            },
        })
    }

    private assertMethod(method: string) {
        if (!SUPPORTED.has(method)) {
            throw new BadRequestException(
                `Unsupported valuation method: ${method}`,
            )
        }
    }
}
