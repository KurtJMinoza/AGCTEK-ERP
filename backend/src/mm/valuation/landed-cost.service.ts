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
    CreateLandedCostDto,
    LandedCostQueryDto,
    AllocatePreviewDto,
} from './dto/valuation.dto'
import { ValuationEngineService } from './valuation-engine.service'
import { normalizeAllocationBase } from './valuation.constants'

@Injectable()
export class LandedCostService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => ValuationEngineService))
        private valuationEngine: ValuationEngineService,
    ) {}

    async findAll(query: LandedCostQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 20
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.status) where.status = query.status

        const [data, total] = await Promise.all([
            this.prisma.mmLandedCost.findMany({
                where,
                include: {
                    lines: true,
                    allocations: true,
                    warehouse: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmLandedCost.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const row = await this.prisma.mmLandedCost.findUnique({
            where: { id },
            include: { lines: true, allocations: true, warehouse: true },
        })
        if (!row) throw new NotFoundException('Landed cost not found')
        return row
    }

    async create(dto: CreateLandedCostDto) {
        if (!dto.lines?.length) {
            throw new BadRequestException('At least one cost line is required')
        }
        const totalAmount = dto.lines.reduce(
            (s, l) => s.plus(l.amount),
            new Decimal(0),
        )
        const documentNumber = await this.generateDocNumber()

        return this.prisma.mmLandedCost.create({
            data: {
                documentNumber,
                companyId: dto.companyId,
                warehouseId: dto.warehouseId ?? null,
                allocationBase: dto.allocationBase,
                currencyId: dto.currencyId ?? null,
                totalAmount,
                status: 'DRAFT',
                referenceDocType: dto.referenceDocType ?? null,
                referenceDocId: dto.referenceDocId ?? null,
                remarks: dto.remarks ?? null,
                createdBy: dto.createdBy ?? null,
                lines: {
                    create: dto.lines.map((l) => ({
                        costType: l.costType,
                        costElementId: l.costElementId ?? null,
                        description: l.description ?? null,
                        amount: new Decimal(l.amount),
                        materialId: l.materialId ?? null,
                        weight: l.weight != null ? new Decimal(l.weight) : null,
                        volume: l.volume != null ? new Decimal(l.volume) : null,
                        quantity:
                            l.quantity != null ? new Decimal(l.quantity) : null,
                        valueBase:
                            l.valueBase != null
                                ? new Decimal(l.valueBase)
                                : null,
                    })),
                },
            },
            include: { lines: true, allocations: true },
        })
    }

    /** Canonical allocate = allocateAndCapitalize. */
    async allocate(id: string, dto: AllocatePreviewDto = {}) {
        return this.allocateAndCapitalize(id, dto)
    }

    /**
     * Preview allocation only — stays DRAFT; does not capitalize.
     */
    async allocatePreview(id: string, dto: AllocatePreviewDto = {}) {
        const doc = await this.findOne(id)
        if (doc.status === 'CANCELLED') {
            throw new BadRequestException('Cannot allocate a cancelled document')
        }
        if (doc.status === 'ALLOCATED') {
            throw new BadRequestException('Document already capitalized')
        }

        const preview = this.computeAllocation(doc, dto)

        await this.prisma.mmLandedCostAllocation.deleteMany({
            where: { landedCostId: id },
        })
        await this.prisma.mmLandedCostAllocation.createMany({
            data: preview.map((p: { materialId: string; allocatedAmount: string; allocationShare: string }) => ({
                landedCostId: id,
                materialId: p.materialId,
                allocatedAmount: new Decimal(p.allocatedAmount),
                allocationShare: new Decimal(p.allocationShare),
                notes: 'Preview allocation — not capitalized',
            })),
        })
        // Keep DRAFT — capitalization is a separate step

        return this.findOne(id)
    }

    /**
     * Allocate and capitalize onto MAP / FIFO / standard-cost variance.
     */
    async allocateAndCapitalize(id: string, dto: AllocatePreviewDto = {}) {
        const doc = await this.findOne(id)
        if (doc.status === 'CANCELLED') {
            throw new BadRequestException('Cannot capitalize a cancelled document')
        }
        if (doc.status === 'ALLOCATED') {
            throw new BadRequestException('Document already capitalized')
        }

        const warehouseId = dto.warehouseId ?? doc.warehouseId
        if (!warehouseId) {
            throw new BadRequestException(
                'warehouseId is required on the landed cost document (or capitalize payload)',
            )
        }

        const preview = this.computeAllocation(doc, dto)

        await this.prisma.mmLandedCostAllocation.deleteMany({
            where: { landedCostId: id },
        })
        await this.prisma.mmLandedCostAllocation.createMany({
            data: preview.map((p: { materialId: string; allocatedAmount: string; allocationShare: string }) => ({
                landedCostId: id,
                materialId: p.materialId,
                allocatedAmount: new Decimal(p.allocatedAmount),
                allocationShare: new Decimal(p.allocationShare),
                notes: 'Capitalized',
            })),
        })

        for (const p of preview) {
            const amount = new Decimal(p.allocatedAmount)
            if (amount.lte(0)) continue
            await this.valuationEngine.applyLandedCost({
                companyId: doc.companyId,
                warehouseId,
                materialId: p.materialId,
                allocatedAmount: amount,
                landedCostId: id,
            })
        }

        await this.prisma.mmLandedCost.update({
            where: { id },
            data: {
                status: 'ALLOCATED',
                warehouseId,
            },
        })

        return this.findOne(id)
    }

    private computeAllocation(doc: any, dto: AllocatePreviewDto) {
        const total = new Decimal(doc.totalAmount)
        const targets =
            dto.targets?.length
                ? dto.targets
                : doc.lines
                      .filter((l: any) => l.materialId)
                      .map((l: any) => ({
                          materialId: l.materialId as string,
                          quantity: l.quantity ? Number(l.quantity) : undefined,
                          weight: l.weight ? Number(l.weight) : undefined,
                          volume: l.volume ? Number(l.volume) : undefined,
                          value: l.valueBase ? Number(l.valueBase) : undefined,
                          manualAmount: undefined as number | undefined,
                      }))

        if (!targets.length) {
            throw new BadRequestException(
                'Provide allocation targets or lines with materialId',
            )
        }

        const base = normalizeAllocationBase(doc.allocationBase as string)
        const weights: Decimal[] = targets.map((t: any) => {
            if (base === 'MANUAL') return new Decimal(t.manualAmount ?? 0)
            if (base === 'QUANTITY') return new Decimal(t.quantity ?? 0)
            if (base === 'WEIGHT') return new Decimal(t.weight ?? 0)
            if (base === 'VOLUME') return new Decimal(t.volume ?? 0)
            return new Decimal(t.value ?? 0)
        })
        const sum = weights.reduce(
            (s: Decimal, w: Decimal) => s.plus(w),
            new Decimal(0),
        )
        if (sum.lte(0) && base !== 'MANUAL') {
            throw new BadRequestException(
                `Allocation base ${base} sums to zero`,
            )
        }

        return targets.map((t: any, i: number) => {
            const share =
                base === 'MANUAL'
                    ? new Decimal(t.manualAmount ?? 0)
                    : total.mul(weights[i]).div(sum)
            return {
                materialId: t.materialId as string,
                allocatedAmount: share.toFixed(6),
                allocationShare: sum.gt(0)
                    ? weights[i].div(sum).toFixed(6)
                    : '0',
            }
        })
    }

    private async generateDocNumber(): Promise<string> {
        const today = new Date()
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
        const prefix = `LC-${dateStr}-`
        const last = await this.prisma.mmLandedCost.findFirst({
            where: { documentNumber: { startsWith: prefix } },
            orderBy: { documentNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.documentNumber.replace(prefix, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${prefix}${String(seq).padStart(5, '0')}`
    }
}
