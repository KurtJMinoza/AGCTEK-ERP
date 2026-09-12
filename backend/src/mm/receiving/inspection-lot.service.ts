import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { QualityInspectionService } from '../inbound/quality-inspection.service'
import { MmDomainEventsService } from '../common/mm-domain-events.service'
import { MM_DOMAIN_EVENTS } from '../common/mm-domain-events.types'
import { RecordInspectionResultsDto, UsageDecisionDto, ReceivingQueryDto } from './dto/receiving.dto'
import { QualityDecisionService } from './quality-decision.service'
import { Decimal } from '@prisma/client/runtime/library'

const LOT_INCLUDES = {
    material: { select: { id: true, materialCode: true, materialName: true } },
    goodsReceipt: { select: { id: true, documentNumber: true, supplierId: true } },
    plan: { include: { characteristics: { orderBy: { lineNumber: 'asc' as const } } } },
    samples: true,
    results: { include: { characteristic: true, sample: true } },
    defects: true,
    decisions: true,
    qualityHolds: { where: { status: 'ACTIVE' } },
}

@Injectable()
export class InspectionLotService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => QualityInspectionService))
        private legacyQi: QualityInspectionService,
        private qualityDecision: QualityDecisionService,
        private domainEvents: MmDomainEventsService,
    ) {}

    async createFromGoodsReceipt(
        grId: string,
        lines: Array<{ goodsReceiptLineId: string; materialId: string; quantity: number }>,
    ) {
        if (!lines.length) return []

        const gr = await this.prisma.mmGoodsReceipt.findUnique({
            where: { id: grId },
            include: { lines: { include: { material: true } } },
        })
        if (!gr) return []

        const legacyQi = await this.legacyQi.createFromGoodsReceipt(grId, lines)
        const created: any[] = []

        for (const l of lines) {
            const lotNumber = await this.nextLotNumber()
            const grLine = gr.lines.find((gl) => gl.id === l.goodsReceiptLineId)
            const plan = grLine?.material?.materialCategoryId
                ? await this.prisma.mmInspectionPlan.findFirst({
                      where: {
                          companyId: gr.companyId,
                          status: 'ACTIVE',
                          materialCategoryId: grLine.material.materialCategoryId,
                      },
                      include: { characteristics: true },
                  })
                : null

            const lot = await this.prisma.mmInspectionLot.create({
                data: {
                    lotNumber,
                    companyId: gr.companyId,
                    goodsReceiptId: grId,
                    goodsReceiptLineId: l.goodsReceiptLineId,
                    materialId: l.materialId,
                    warehouseId: gr.warehouseId,
                    quantity: new Decimal(l.quantity),
                    planId: plan?.id ?? null,
                    legacyQualityInspectionId: legacyQi?.id ?? null,
                    status: 'PENDING',
                },
                include: LOT_INCLUDES,
            })
            created.push(lot)

            void this.domainEvents.emit({
                eventType: MM_DOMAIN_EVENTS.INSPECTION_LOT_CREATED,
                companyId: gr.companyId,
                sourceModule: 'QUALITY',
                documentType: 'INSPECTION_LOT',
                documentId: lot.id,
                occurredAt: new Date().toISOString(),
                payload: {
                    lotNumber: lot.lotNumber,
                    goodsReceiptId: grId,
                    quantity: l.quantity,
                },
            })
        }

        return created
    }

    async findAll(query: ReceivingQueryDto) {
        const where: any = {}
        if (query.status) where.status = query.status
        if (query.companyId) where.companyId = query.companyId
        if (query.search) {
            where.OR = [{ lotNumber: { contains: query.search, mode: 'insensitive' } }]
        }
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.mmInspectionLot.findMany({
                where,
                include: LOT_INCLUDES,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmInspectionLot.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const lot = await this.prisma.mmInspectionLot.findUnique({
            where: { id },
            include: LOT_INCLUDES,
        })
        if (!lot) throw new NotFoundException('Inspection lot not found')
        return lot
    }

    async recordResults(id: string, dto: RecordInspectionResultsDto) {
        const lot = await this.findOne(id)
        if (['COMPLETED', 'CANCELLED'].includes(lot.status)) {
            throw new BadRequestException(`Cannot record results on lot in status ${lot.status}`)
        }

        if (dto.samples?.length) {
            for (const s of dto.samples) {
                await this.prisma.mmInspectionSample.create({
                    data: {
                        inspectionLotId: id,
                        sampleNumber: s.sampleNumber ?? 1,
                        sampleSize: new Decimal(s.sampleSize),
                        notes: s.notes ?? null,
                    },
                })
            }
        }

        if (dto.results?.length) {
            for (const r of dto.results) {
                let passed = r.passed
                if (passed === undefined && r.characteristicId && r.numericValue != null) {
                    const ch = await this.prisma.mmInspectionCharacteristic.findUnique({
                        where: { id: r.characteristicId },
                    })
                    if (ch?.toleranceMin != null && r.numericValue < Number(ch.toleranceMin)) passed = false
                    if (ch?.toleranceMax != null && r.numericValue > Number(ch.toleranceMax)) passed = false
                    if (passed === undefined) passed = true
                }
                await this.prisma.mmInspectionResult.create({
                    data: {
                        inspectionLotId: id,
                        sampleId: r.sampleId ?? null,
                        characteristicId: r.characteristicId ?? null,
                        measuredValue: r.measuredValue ?? null,
                        numericValue: r.numericValue != null ? new Decimal(r.numericValue) : null,
                        passed: passed ?? null,
                        notes: r.notes ?? null,
                        recordedBy: dto.recordedBy ?? null,
                    },
                })
            }
        }

        if (dto.defects?.length) {
            for (const d of dto.defects) {
                await this.prisma.mmInspectionDefect.create({
                    data: {
                        inspectionLotId: id,
                        defectCode: d.defectCode,
                        quantity: new Decimal(d.quantity),
                        severity: d.severity ?? null,
                        notes: d.notes ?? null,
                    },
                })
            }
        }

        return this.prisma.mmInspectionLot.update({
            where: { id },
            data: { status: 'IN_PROGRESS' },
            include: LOT_INCLUDES,
        })
    }

    async usageDecision(id: string, dto: UsageDecisionDto) {
        const lot = await this.findOne(id)
        if (lot.qualityHolds?.length) {
            throw new BadRequestException('Active quality hold blocks usage decision')
        }
        return this.qualityDecision.applyDecision(lot, dto)
    }

    /** Bridge legacy QI id → inspection lot */
    async findByLegacyQiId(legacyId: string) {
        return this.prisma.mmInspectionLot.findFirst({
            where: { legacyQualityInspectionId: legacyId },
            include: LOT_INCLUDES,
        })
    }

    private async nextLotNumber() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `IL-${today}-`
        const last = await this.prisma.mmInspectionLot.findFirst({
            where: { lotNumber: { startsWith: pfx } },
            orderBy: { lotNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.lotNumber.replace(pfx, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
