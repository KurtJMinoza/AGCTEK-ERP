import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { MmDomainEventsService } from '../common/mm-domain-events.service'
import { MM_DOMAIN_EVENTS } from '../common/mm-domain-events.types'
import { RecordInspectionResultsDto, UsageDecisionDto, ReceivingQueryDto } from './dto/receiving.dto'
import { QualityDecisionService } from './quality-decision.service'
import { InspectionPlanService } from '../quality/inspection-plan.service'
import { SamplingService } from '../quality/sampling.service'
import { DefectCodeService } from '../quality/defect-code.service'
import { NonconformanceService } from '../quality/nonconformance.service'
import { Decimal } from '@prisma/client/runtime/library'
import { normalizeLotStatus } from '../quality/quality.constants'

const LOT_INCLUDES = {
    material: { select: { id: true, materialCode: true, materialName: true, materialCategoryId: true } },
    goodsReceipt: {
        select: {
            id: true,
            documentNumber: true,
            supplierId: true,
            purchaseOrderId: true,
            warehouseId: true,
            supplier: { select: { id: true, supplierCode: true, supplierName: true } },
        },
    },
    supplier: { select: { id: true, supplierCode: true, supplierName: true } },
    purchaseOrder: { select: { id: true, poNumber: true } },
    batch: { select: { id: true, batchNumber: true } },
    serialNumber: { select: { id: true, serialNumber: true } },
    plan: { include: { characteristics: { orderBy: { lineNumber: 'asc' as const } } } },
    samples: true,
    results: { include: { characteristic: true, sample: true } },
    defects: { include: { defectCodeRef: true } },
    decisions: { orderBy: { decidedAt: 'desc' as const } },
    qualityHolds: { where: { status: 'ACTIVE' } },
    nonconformances: true,
}

const TERMINAL_STATUSES = ['CLOSED', 'CANCELLED', 'DECIDED']

@Injectable()
export class InspectionLotService {
    constructor(
        private prisma: PrismaService,
        private qualityDecision: QualityDecisionService,
        private domainEvents: MmDomainEventsService,
        private planService: InspectionPlanService,
        private sampling: SamplingService,
        private defectCodes: DefectCodeService,
        @Inject(forwardRef(() => NonconformanceService))
        private nonconformance: NonconformanceService,
    ) {}

    async createFromGoodsReceipt(
        grId: string,
        lines: Array<{
            goodsReceiptLineId: string
            materialId: string
            quantity: number
            samplingOverride?: 'FULL' | 'FIXED' | 'PERCENTAGE'
        }>,
    ) {
        if (!lines.length) return []

        const gr = await this.prisma.mmGoodsReceipt.findUnique({
            where: { id: grId },
            include: {
                lines: { include: { material: true } },
                supplier: true,
            },
        })
        if (!gr) return []

        const created: any[] = []

        for (const l of lines) {
            const lotNumber = await this.nextLotNumber()
            const grLine = gr.lines.find((gl) => gl.id === l.goodsReceiptLineId)
            const plan =
                (await this.planService.selectPlan({
                    companyId: gr.companyId,
                    materialId: l.materialId,
                    materialCategoryId: grLine?.material?.materialCategoryId,
                    supplierId: gr.supplierId ?? undefined,
                    plantId: undefined,
                })) ??
                (grLine?.material?.materialCategoryId
                    ? await this.prisma.mmInspectionPlan.findFirst({
                          where: {
                              companyId: gr.companyId,
                              status: 'ACTIVE',
                              materialCategoryId: grLine.material.materialCategoryId,
                          },
                          include: { characteristics: true },
                      })
                    : null)

            const effectiveSamplingType =
                l.samplingOverride === 'FULL'
                    ? 'FULL'
                    : l.samplingOverride ?? plan?.samplingType ?? 'FULL'

            const { sampleQuantity, samplingType } = this.sampling.computeSampleQuantity({
                lotQuantity: l.quantity,
                samplingType: effectiveSamplingType,
                sampleSize: plan?.sampleSize,
                samplePercent:
                    plan?.samplePercent ??
                    (l.samplingOverride === 'PERCENTAGE' ? 10 : undefined),
                allowFullInspection: plan?.allowFullInspection,
            })

            const lot = await this.prisma.mmInspectionLot.create({
                data: {
                    lotNumber,
                    companyId: gr.companyId,
                    goodsReceiptId: grId,
                    goodsReceiptLineId: l.goodsReceiptLineId,
                    materialId: l.materialId,
                    warehouseId: gr.warehouseId,
                    plantId: null,
                    supplierId: gr.supplierId ?? null,
                    purchaseOrderId: gr.purchaseOrderId ?? null,
                    batchId: grLine?.batchId ?? null,
                    serialNumberId: grLine?.serialNumberId ?? null,
                    quantity: new Decimal(l.quantity),
                    sampleQuantity,
                    samplingType,
                    planId: plan?.id ?? null,
                    sourceDocumentType: 'GOODS_RECEIPT',
                    sourceDocumentId: grId,
                    status: plan ? 'READY' : 'CREATED',
                    priority: 'NORMAL',
                },
                include: LOT_INCLUDES,
            })
            created.push(lot)

            if (sampleQuantity.gt(0) && samplingType !== 'FULL') {
                await this.prisma.mmInspectionSample.create({
                    data: {
                        inspectionLotId: lot.id,
                        sampleNumber: 1,
                        sampleSize: sampleQuantity,
                        notes: `Auto-generated ${samplingType} sample`,
                    },
                })
            }

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
                    samplingType,
                    sampleQuantity: Number(sampleQuantity),
                },
            })
        }

        return created
    }

    async findAll(query: ReceivingQueryDto) {
        const where: any = {}
        if (query.status) {
            const statuses =
                query.status === 'PENDING'
                    ? ['CREATED', 'READY', 'PENDING']
                    : query.status === 'COMPLETED'
                      ? ['DECIDED', 'CLOSED', 'COMPLETED']
                      : [query.status]
            where.status = statuses.length === 1 ? statuses[0] : { in: statuses }
        }
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
        if (TERMINAL_STATUSES.includes(normalizeLotStatus(lot.status))) {
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

        let anyFail = false
        if (dto.results?.length) {
            for (const r of dto.results) {
                let passed = r.passed
                let result: string | null = null
                if (r.characteristicId && r.numericValue != null) {
                    const ch = await this.prisma.mmInspectionCharacteristic.findUnique({
                        where: { id: r.characteristicId },
                    })
                    if (ch?.toleranceMin != null && r.numericValue < Number(ch.toleranceMin)) passed = false
                    if (ch?.toleranceMax != null && r.numericValue > Number(ch.toleranceMax)) passed = false
                    if (passed === undefined) passed = true
                }
                if (passed === true) result = 'PASS'
                else if (passed === false) {
                    result = 'FAIL'
                    anyFail = true
                } else if (r.measuredValue) {
                    result = r.measuredValue.toUpperCase() === 'PASS' ? 'PASS' : r.measuredValue.toUpperCase() === 'FAIL' ? 'FAIL' : 'NOT_APPLICABLE'
                    if (result === 'FAIL') anyFail = true
                }
                await this.prisma.mmInspectionResult.create({
                    data: {
                        inspectionLotId: id,
                        sampleId: r.sampleId ?? null,
                        characteristicId: r.characteristicId ?? null,
                        measuredValue: r.measuredValue ?? null,
                        numericValue: r.numericValue != null ? new Decimal(r.numericValue) : null,
                        result,
                        passed: passed ?? null,
                        notes: r.notes ?? null,
                        recordedBy: dto.recordedBy ?? null,
                    },
                })
            }
        }

        if (dto.defects?.length) {
            for (const d of dto.defects) {
                const master = await this.defectCodes.resolveCode(lot.companyId, d.defectCode)
                const defect = await this.prisma.mmInspectionDefect.create({
                    data: {
                        inspectionLotId: id,
                        defectCodeId: master.id,
                        defectCode: master.code,
                        quantity: new Decimal(d.quantity),
                        severity: d.severity ?? master.severityDefault ?? null,
                        notes: d.notes ?? null,
                    },
                })
                anyFail = true
                await this.nonconformance.createFromDefect(defect.id, dto.recordedBy)
            }
        }

        const nextStatus =
            lot.status === 'CREATED' || lot.status === 'READY' ? 'IN_PROGRESS' : lot.status

        return this.prisma.mmInspectionLot.update({
            where: { id },
            data: {
                status: nextStatus,
                result: anyFail ? 'FAIL' : lot.result ?? 'PASS',
            },
            include: LOT_INCLUDES,
        })
    }

    async usageDecision(id: string, dto: UsageDecisionDto & { idempotencyKey?: string; reason?: string }) {
        const lot = await this.findOne(id)
        if (lot.qualityHolds?.length) {
            throw new BadRequestException('Active quality hold blocks usage decision')
        }
        const terminal = ['CLOSED', 'CANCELLED']
        if (terminal.includes(lot.status)) {
            throw new BadRequestException(`Lot is ${lot.status}`)
        }
        return this.qualityDecision.applyDecision(lot, dto)
    }

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
