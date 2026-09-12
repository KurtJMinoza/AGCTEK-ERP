import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { SupplierScoreConfigService } from './supplier-score-config.service'
import { SupplierAlertService } from './supplier-alert.service'
import {
    computeSupplierMetrics,
    toDecimal,
    aggregateTrend,
    compareSupplierScores,
    type MetricInputs,
} from './score-engine'
import {
    RunEvaluationDto,
    EvaluationQueryDto,
    TrendsQueryDto,
} from './dto/supplier-performance.dto'

const EVAL_INCLUDE = {
    supplier: {
        select: {
            id: true,
            supplierCode: true,
            supplierName: true,
            status: true,
            leadTimeDays: true,
        },
    },
    company: { select: { id: true, name: true, code: true } },
}

@Injectable()
export class SupplierEvaluationService {
    constructor(
        private prisma: PrismaService,
        private config: SupplierScoreConfigService,
        private alerts: SupplierAlertService,
    ) {}

    async findAll(query: EvaluationQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 50
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.supplierId) where.supplierId = query.supplierId
        if (query.periodStart || query.periodEnd) {
            where.periodStart = {}
            if (query.periodStart) where.periodStart.gte = new Date(query.periodStart)
            if (query.periodEnd) where.periodEnd = { lte: new Date(query.periodEnd) }
        }

        const [data, total] = await Promise.all([
            this.prisma.mmSupplierEvaluation.findMany({
                where,
                include: EVAL_INCLUDE,
                orderBy: [{ periodEnd: 'desc' }, { overallScore: 'desc' }],
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmSupplierEvaluation.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const row = await this.prisma.mmSupplierEvaluation.findUnique({
            where: { id },
            include: {
                ...EVAL_INCLUDE,
                alerts: true,
            },
        })
        if (!row) throw new NotFoundException('Supplier evaluation not found')
        return row
    }

    async run(dto: RunEvaluationDto) {
        const periodStart = new Date(dto.periodStart)
        const periodEnd = new Date(dto.periodEnd)
        if (periodEnd < periodStart) {
            throw new BadRequestException('periodEnd must be >= periodStart')
        }

        const weightRow = await this.config.getWeights(dto.companyId)
        const weights = this.config.toWeights(weightRow as any)
        const alertCfg = await this.config.getAlertConfig(dto.companyId)

        const supplierIds = await this.resolveSuppliers(
            dto.companyId,
            periodStart,
            periodEnd,
            dto.supplierId,
        )

        const results: any[] = []
        for (const supplierId of supplierIds) {
            const metrics = await this.gatherMetrics(
                dto.companyId,
                supplierId,
                periodStart,
                periodEnd,
            )
            const computed = computeSupplierMetrics(metrics, weights)
            const snapshot = this.toEvaluationSnapshot(computed, weights)

            const evaluation = await this.prisma.mmSupplierEvaluation.upsert({
                where: {
                    companyId_supplierId_periodStart_periodEnd: {
                        companyId: dto.companyId,
                        supplierId,
                        periodStart,
                        periodEnd,
                    },
                },
                create: {
                    companyId: dto.companyId,
                    supplierId,
                    periodStart,
                    periodEnd,
                    ...snapshot,
                },
                update: snapshot,
                include: EVAL_INCLUDE,
            })

            if (alertCfg.isActive) {
                await this.raiseThresholdAlerts({
                    companyId: dto.companyId,
                    supplierId,
                    evaluationId: evaluation.id,
                    supplierCode: evaluation.supplier.supplierCode,
                    computed,
                    alertCfg,
                })
            }

            results.push(evaluation)
        }

        return {
            periodStart,
            periodEnd,
            evaluated: results.length,
            data: results,
        }
    }

    async trends(query: TrendsQueryDto) {
        const take = query.periods ?? 12
        const rows = await this.prisma.mmSupplierEvaluation.findMany({
            where: {
                companyId: query.companyId,
                supplierId: query.supplierId,
            },
            orderBy: { periodStart: 'desc' },
            take,
        })
        return {
            supplierId: query.supplierId,
            data: aggregateTrend(rows.reverse()),
        }
    }

    private async resolveSuppliers(
        companyId: string,
        periodStart: Date,
        periodEnd: Date,
        supplierId?: string,
    ): Promise<string[]> {
        if (supplierId) return [supplierId]

        const [gr, inv, rfq, po, ret] = await Promise.all([
            this.prisma.mmGoodsReceipt.findMany({
                where: {
                    companyId,
                    status: 'POSTED',
                    postingDate: { gte: periodStart, lte: periodEnd },
                    supplierId: { not: null },
                },
                select: { supplierId: true },
                distinct: ['supplierId'],
            }),
            this.prisma.mmSupplierInvoice.findMany({
                where: {
                    companyId,
                    invoiceDate: { gte: periodStart, lte: periodEnd },
                },
                select: { supplierId: true },
                distinct: ['supplierId'],
            }),
            this.prisma.mmRfqSupplier.findMany({
                where: {
                    invitedAt: { gte: periodStart, lte: periodEnd },
                    rfq: { companyId },
                },
                select: { supplierId: true },
                distinct: ['supplierId'],
            }),
            this.prisma.mmPurchaseOrder.findMany({
                where: {
                    companyId,
                    createdAt: { gte: periodStart, lte: periodEnd },
                    status: { notIn: ['CANCELLED', 'DRAFT'] },
                },
                select: { supplierId: true },
                distinct: ['supplierId'],
            }),
            this.prisma.mmSupplierReturn.findMany({
                where: {
                    companyId,
                    status: { in: ['SHIPPED', 'COMPLETED'] },
                    OR: [
                        { shippedAt: { gte: periodStart, lte: periodEnd } },
                        {
                            shippedAt: null,
                            updatedAt: { gte: periodStart, lte: periodEnd },
                        },
                    ],
                },
                select: { supplierId: true },
                distinct: ['supplierId'],
            }),
        ])

        const ids = new Set<string>()
        for (const r of gr) if (r.supplierId) ids.add(r.supplierId)
        for (const r of inv) ids.add(r.supplierId)
        for (const r of rfq) ids.add(r.supplierId)
        for (const r of po) if (r.supplierId) ids.add(r.supplierId)
        for (const r of ret) ids.add(r.supplierId)
        return [...ids]
    }

    private async gatherMetrics(
        companyId: string,
        supplierId: string,
        periodStart: Date,
        periodEnd: Date,
    ): Promise<MetricInputs> {
        const supplier = await this.prisma.mmSupplier.findUnique({
            where: { id: supplierId },
            select: { leadTimeDays: true },
        })

        const grs = await this.prisma.mmGoodsReceipt.findMany({
            where: {
                companyId,
                supplierId,
                status: 'POSTED',
                postingDate: { gte: periodStart, lte: periodEnd },
            },
            include: {
                lines: {
                    include: {
                        purchaseOrderLine: true,
                    },
                },
                purchaseOrder: true,
                qualityInspections: {
                    include: { lines: true },
                },
            },
        })

        const deliveries: MetricInputs['deliveries'] = []
        const grLines: MetricInputs['grLines'] = []
        const qualityLines: MetricInputs['qualityLines'] = []
        const leadTimes: MetricInputs['leadTimes'] = []
        let purchaseVolume = 0
        let receivingVarianceEvents = 0

        for (const gr of grs) {
            for (const line of gr.lines) {
                const qty = Number(line.quantity)
                const damaged = Number(line.damagedQuantity || 0)
                const unitCost = Number(line.unitCost || 0)
                grLines.push({ quantity: qty, damagedQuantity: damaged })
                purchaseVolume += qty * unitCost

                const shortage = Number(line.shortageQuantity || 0)
                const overage = Number(line.overageQuantity || 0)
                if (
                    shortage > 0 ||
                    overage > 0 ||
                    damaged > 0 ||
                    Number(line.rejectedQuantity || 0) > 0 ||
                    line.discrepancyFlag
                ) {
                    receivingVarianceEvents++
                }

                const poLine = line.purchaseOrderLine
                const promised =
                    poLine?.expectedDeliveryDate ??
                    gr.purchaseOrder?.expectedDeliveryDate ??
                    poLine?.requiredDate ??
                    null
                deliveries.push({
                    promisedDate: promised,
                    actualDate: gr.postingDate,
                })

                if (gr.purchaseOrder?.sentAt) {
                    const actualLead = Math.max(
                        0,
                        Math.round(
                            (dayMs(gr.postingDate) - dayMs(gr.purchaseOrder.sentAt)) /
                                (24 * 60 * 60 * 1000),
                        ),
                    )
                    let promisedLead = supplier?.leadTimeDays ?? 0
                    if (promised) {
                        promisedLead = Math.max(
                            0,
                            Math.round(
                                (dayMs(promised) - dayMs(gr.purchaseOrder.sentAt)) /
                                    (24 * 60 * 60 * 1000),
                            ),
                        )
                    }
                    if (promisedLead <= 0 && supplier?.leadTimeDays) {
                        promisedLead = supplier.leadTimeDays
                    }
                    if (promisedLead > 0) {
                        leadTimes.push({
                            actualLeadDays: actualLead,
                            promisedLeadDays: promisedLead,
                        })
                    }
                }
            }

            for (const qi of gr.qualityInspections) {
                for (const ql of qi.lines) {
                    qualityLines.push({
                        quantity: Number(ql.quantity),
                        passQuantity: Number(ql.passQuantity || 0),
                        failQuantity: Number(ql.failQuantity || 0),
                    })
                }
            }
        }

        const invoices = await this.prisma.mmSupplierInvoice.findMany({
            where: {
                companyId,
                supplierId,
                invoiceDate: { gte: periodStart, lte: periodEnd },
                status: { not: 'CANCELLED' },
            },
            include: {
                lines: {
                    include: { purchaseOrderLine: true },
                },
            },
        })

        const supplierMaterials = await this.prisma.mmSupplierMaterial.findMany({
            where: { supplierId, status: 'ACTIVE' },
            select: { materialId: true, unitPrice: true },
        })
        const histByMaterial = new Map(
            supplierMaterials.map((m) => [m.materialId, Number(m.unitPrice)]),
        )

        const supplierMaterialIds = [
            ...new Set(
                [
                    ...supplierMaterials.map((m) => m.materialId),
                    ...invoices.flatMap((inv) =>
                        inv.lines
                            .map((l) => l.purchaseOrderLine?.materialId)
                            .filter(Boolean),
                    ),
                ].filter(Boolean) as string[],
            ),
        ]

        const priceVariances =
            supplierMaterialIds.length > 0
                ? await this.prisma.mmPriceVariance.findMany({
                      where: {
                          companyId,
                          materialId: { in: supplierMaterialIds },
                          createdAt: { gte: periodStart, lte: periodEnd },
                          OR: [
                              { landedUnitCost: { not: null } },
                              { varianceType: 'LANDED' },
                          ],
                      },
                      select: {
                          materialId: true,
                          poPrice: true,
                          invoicePrice: true,
                          landedUnitCost: true,
                      },
                      take: 500,
                  })
                : []

        const landedByMaterial = new Map<string, number>()
        for (const pv of priceVariances) {
            if (pv.landedUnitCost != null) {
                landedByMaterial.set(pv.materialId, Number(pv.landedUnitCost))
            }
        }

        const prices: MetricInputs['prices'] = []
        for (const inv of invoices) {
            for (const line of inv.lines) {
                const poPrice = line.purchaseOrderLine
                    ? Number(line.purchaseOrderLine.unitPrice)
                    : Number(priceVariances.find(
                          (p) =>
                              p.materialId === line.purchaseOrderLine?.materialId &&
                              p.poPrice != null,
                      )?.poPrice ?? 0)
                const materialId = line.purchaseOrderLine?.materialId
                const invPrice = Number(line.unitPrice)
                prices.push({
                    poUnitPrice:
                        poPrice ||
                        (materialId
                            ? Number(
                                  priceVariances.find((p) => p.materialId === materialId)
                                      ?.poPrice ?? 0,
                              )
                            : 0),
                    invoiceUnitPrice: invPrice,
                    historicalUnitPrice: materialId
                        ? histByMaterial.get(materialId) ?? null
                        : null,
                    landedUnitCost: materialId
                        ? landedByMaterial.get(materialId) ?? null
                        : null,
                })
            }
        }

        // Quantity accuracy: PO ordered vs GR received for supplier in period
        const purchaseOrders = await this.prisma.mmPurchaseOrder.findMany({
            where: {
                companyId,
                supplierId,
                status: { notIn: ['CANCELLED', 'DRAFT'] },
                OR: [
                    { createdAt: { gte: periodStart, lte: periodEnd } },
                    {
                        goodsReceipts: {
                            some: {
                                status: 'POSTED',
                                postingDate: { gte: periodStart, lte: periodEnd },
                            },
                        },
                    },
                ],
            },
            include: {
                lines: {
                    select: {
                        quantity: true,
                        receivedQuantity: true,
                    },
                },
            },
            take: 500,
        })
        const quantities: MetricInputs['quantities'] = []
        for (const po of purchaseOrders) {
            for (const line of po.lines) {
                quantities.push({
                    orderedQty: Number(line.quantity),
                    receivedQty: Number(line.receivedQuantity || 0),
                })
            }
        }

        const rfqInvites = await this.prisma.mmRfqSupplier.findMany({
            where: {
                supplierId,
                invitedAt: { gte: periodStart, lte: periodEnd },
                rfq: { companyId },
            },
            include: {
                rfq: { select: { responseDeadline: true } },
            },
        })

        const rfqResponses: MetricInputs['rfqResponses'] = rfqInvites.map((r) => ({
            invitedAt: r.invitedAt,
            respondedAt: r.respondedAt,
            responseDeadline: r.rfq.responseDeadline,
        }))

        const exceptions = await this.prisma.mmMatchException.count({
            where: {
                invoice: {
                    companyId,
                    supplierId,
                    invoiceDate: { gte: periodStart, lte: periodEnd },
                },
                varianceType: { in: ['PRICE', 'QUANTITY'] },
                status: { in: ['OPEN', 'ACKNOWLEDGED'] },
            },
        })

        const invoiceLineCount = invoices.reduce((s, i) => s + i.lines.length, 0)
        const compliance = {
            totalEvents: invoiceLineCount > 0 ? invoiceLineCount : grs.length || 1,
            exceptionEvents: exceptions + receivingVarianceEvents,
        }
        if (invoiceLineCount === 0 && grs.length === 0) {
            compliance.totalEvents = 0
            compliance.exceptionEvents = 0
        } else if (invoiceLineCount === 0) {
            compliance.totalEvents = Math.max(grs.length, receivingVarianceEvents)
            compliance.exceptionEvents = receivingVarianceEvents
        }

        const returns = await this.prisma.mmSupplierReturn.findMany({
            where: {
                companyId,
                supplierId,
                status: { in: ['SHIPPED', 'COMPLETED'] },
                OR: [
                    { shippedAt: { gte: periodStart, lte: periodEnd } },
                    {
                        shippedAt: null,
                        updatedAt: { gte: periodStart, lte: periodEnd },
                    },
                ],
            },
            include: { lines: true },
        })
        const supplierReturnQty = returns.reduce(
            (sum, r) =>
                sum +
                r.lines.reduce((s, l) => s + Number(l.quantity || 0), 0),
            0,
        )

        return {
            deliveries,
            qualityLines,
            grLines,
            leadTimes,
            prices,
            quantities,
            rfqResponses,
            compliance,
            purchaseVolume,
            supplierReturnQty,
            receivingVarianceEvents,
        }
    }

    private toEvaluationSnapshot(
        computed: ReturnType<typeof computeSupplierMetrics>,
        weights: ReturnType<SupplierScoreConfigService['toWeights']>,
    ) {
        return {
            onTimePct: toDecimal(computed.onTimePct),
            lateDeliveryRate: toDecimal(computed.lateDeliveryRate),
            avgDelayDays: toDecimal(computed.avgDelayDays),
            qualityAcceptanceRate: toDecimal(computed.qualityAcceptanceRate),
            rejectionRate: toDecimal(computed.rejectionRate),
            returnRate: toDecimal(computed.returnRate),
            leadTimeAccuracyPct: toDecimal(computed.leadTimeAccuracyPct),
            priceVariancePct: toDecimal(computed.priceVariancePct),
            landedCostVariancePct: toDecimal(computed.landedCostVariancePct),
            fillRate: toDecimal(computed.fillRate),
            shortageRate: toDecimal(computed.shortageRate),
            overDeliveryRate: toDecimal(computed.overDeliveryRate),
            avgResponseHours: toDecimal(computed.avgResponseHours),
            complianceRate: toDecimal(computed.complianceRate),
            purchaseVolume: toDecimal(computed.purchaseVolume),
            deliveryScore: toDecimal(computed.deliveryScore),
            qualityScore: toDecimal(computed.qualityScore),
            priceScore: toDecimal(computed.priceScore),
            quantityScore: toDecimal(computed.quantityScore),
            serviceScore: toDecimal(computed.serviceScore),
            complianceScore: toDecimal(computed.complianceScore),
            overallScore: toDecimal(computed.overallScore),
            deliveryWeight: weights.deliveryWeight,
            qualityWeight: weights.qualityWeight,
            priceWeight: weights.priceWeight,
            quantityWeight: weights.quantityWeight,
            serviceWeight: weights.serviceWeight,
            complianceWeight: weights.complianceWeight,
            sampleSizes: computed.sampleSizes,
            computedAt: new Date(),
        }
    }

    /**
     * Advisory alerts only — never updates MmSupplier.status / block flags.
     */
    private async raiseThresholdAlerts(input: {
        companyId: string
        supplierId: string
        evaluationId: string
        supplierCode: string
        computed: ReturnType<typeof computeSupplierMetrics>
        alertCfg: Awaited<ReturnType<SupplierScoreConfigService['getAlertConfig']>>
    }) {
        const { computed, alertCfg } = input
        const base = {
            companyId: input.companyId,
            supplierId: input.supplierId,
            evaluationId: input.evaluationId,
            supplierCode: input.supplierCode,
        }

        if (computed.overallScore < Number(alertCfg.scoreThreshold)) {
            await this.alerts.createIfNeeded({
                ...base,
                alertType: 'POOR_SCORE',
                score: computed.overallScore,
                threshold: Number(alertCfg.scoreThreshold),
            })
        }
        if (
            computed.lateDeliveryRate >
            Number(alertCfg.lateDeliveryRateThreshold ?? 0.25)
        ) {
            await this.alerts.createIfNeeded({
                ...base,
                alertType: 'LATE_DELIVERY',
                score: computed.lateDeliveryRate,
                threshold: Number(alertCfg.lateDeliveryRateThreshold ?? 0.25),
            })
        }
        if (
            computed.rejectionRate > Number(alertCfg.rejectionRateThreshold ?? 0.1)
        ) {
            await this.alerts.createIfNeeded({
                ...base,
                alertType: 'HIGH_REJECTION',
                score: computed.rejectionRate,
                threshold: Number(alertCfg.rejectionRateThreshold ?? 0.1),
            })
        }
        if (
            computed.shortageRate > Number(alertCfg.shortageRateThreshold ?? 0.15)
        ) {
            await this.alerts.createIfNeeded({
                ...base,
                alertType: 'REPEATED_SHORTAGE',
                score: computed.shortageRate,
                threshold: Number(alertCfg.shortageRateThreshold ?? 0.15),
            })
        }
        if (
            computed.priceVariancePct >
            Number(alertCfg.priceVarianceThreshold ?? 0.1)
        ) {
            await this.alerts.createIfNeeded({
                ...base,
                alertType: 'HIGH_PRICE_VARIANCE',
                score: computed.priceVariancePct,
                threshold: Number(alertCfg.priceVarianceThreshold ?? 0.1),
            })
        }
    }

    /**
     * Supplier detail for score / trend / PO / receipt / QI / returns / pricing.
     * Calculated evaluation scores are never overwritten here.
     */
    async getSupplierDetail(supplierId: string, companyId: string, limit = 20) {
        const supplier = await this.prisma.mmSupplier.findFirst({
            where: { id: supplierId, companyId, deletedAt: null },
            select: {
                id: true,
                supplierCode: true,
                supplierName: true,
                status: true,
                leadTimeDays: true,
            },
        })
        if (!supplier) throw new NotFoundException('Supplier not found')

        const [
            latestEvaluation,
            trendRows,
            purchaseOrders,
            goodsReceipts,
            qualityInspections,
            returns,
            invoiceLines,
            prices,
            manualAssessments,
        ] = await Promise.all([
            this.prisma.mmSupplierEvaluation.findFirst({
                where: { companyId, supplierId },
                orderBy: { periodEnd: 'desc' },
                include: EVAL_INCLUDE,
            }),
            this.prisma.mmSupplierEvaluation.findMany({
                where: { companyId, supplierId },
                orderBy: { periodStart: 'desc' },
                take: 12,
            }),
            this.prisma.mmPurchaseOrder.findMany({
                where: { companyId, supplierId },
                orderBy: { createdAt: 'desc' },
                take: limit,
                select: {
                    id: true,
                    poNumber: true,
                    status: true,
                    expectedDeliveryDate: true,
                    totalAmount: true,
                    currencyId: true,
                    sentAt: true,
                    createdAt: true,
                },
            }),
            this.prisma.mmGoodsReceipt.findMany({
                where: { companyId, supplierId },
                orderBy: { postingDate: 'desc' },
                take: limit,
                select: {
                    id: true,
                    documentNumber: true,
                    status: true,
                    postingDate: true,
                    documentDate: true,
                    purchaseOrderId: true,
                    purchaseOrder: {
                        select: {
                            poNumber: true,
                            expectedDeliveryDate: true,
                        },
                    },
                },
            }),
            this.prisma.mmQualityInspection.findMany({
                where: { companyId, goodsReceipt: { supplierId } },
                orderBy: { createdAt: 'desc' },
                take: limit,
                select: {
                    id: true,
                    inspectionNumber: true,
                    status: true,
                    result: true,
                    createdAt: true,
                    goodsReceiptId: true,
                    lines: {
                        select: {
                            quantity: true,
                            passQuantity: true,
                            failQuantity: true,
                        },
                    },
                },
            }),
            this.prisma.mmSupplierReturn.findMany({
                where: { companyId, supplierId },
                orderBy: { createdAt: 'desc' },
                take: limit,
                select: {
                    id: true,
                    returnNumber: true,
                    status: true,
                    reason: true,
                    totalQuantity: true,
                    estimatedValue: true,
                    shippedAt: true,
                    createdAt: true,
                },
            }),
            this.prisma.mmSupplierInvoiceLine.findMany({
                where: {
                    invoice: { companyId, supplierId, status: { not: 'CANCELLED' } },
                },
                orderBy: { id: 'desc' },
                take: limit,
                select: {
                    id: true,
                    unitPrice: true,
                    invoicedQuantity: true,
                    invoice: {
                        select: {
                            id: true,
                            invoiceNumber: true,
                            invoiceDate: true,
                            status: true,
                        },
                    },
                    purchaseOrderLine: {
                        select: {
                            unitPrice: true,
                            materialId: true,
                            material: {
                                select: { materialCode: true, materialName: true },
                            },
                        },
                    },
                },
            }),
            this.prisma.mmSupplierPrice.findMany({
                where: { supplierId, deletedAt: null },
                orderBy: { updatedAt: 'desc' },
                take: limit,
                select: {
                    id: true,
                    materialId: true,
                    unitPrice: true,
                    currencyId: true,
                    effectiveFrom: true,
                    effectiveTo: true,
                    material: {
                        select: { materialCode: true, materialName: true },
                    },
                },
            }),
            this.prisma.mmSupplierManualAssessment.findMany({
                where: { companyId, supplierId },
                orderBy: { assessmentDate: 'desc' },
                take: limit,
            }),
        ])

        const pricingHistory = invoiceLines.map((l) => {
            const poPrice = l.purchaseOrderLine
                ? Number(l.purchaseOrderLine.unitPrice)
                : null
            const invPrice = Number(l.unitPrice)
            const variancePct =
                poPrice && poPrice > 0
                    ? (invPrice - poPrice) / poPrice
                    : null
            return {
                invoiceLineId: l.id,
                invoiceNumber: l.invoice.invoiceNumber,
                invoiceDate: l.invoice.invoiceDate,
                materialCode: l.purchaseOrderLine?.material?.materialCode ?? null,
                materialName: l.purchaseOrderLine?.material?.materialName ?? null,
                poUnitPrice: poPrice,
                invoiceUnitPrice: invPrice,
                priceVariancePct: variancePct,
            }
        })

        return {
            supplier,
            score: latestEvaluation,
            trend: aggregateTrend(trendRows.reverse()),
            purchaseOrders,
            goodsReceipts: goodsReceipts.map((g) => ({
                ...g,
                promisedDate: g.purchaseOrder?.expectedDeliveryDate ?? null,
                actualReceiptDate: g.postingDate,
            })),
            qualityHistory: qualityInspections.map((q) => {
                const received = q.lines.reduce(
                    (s, l) => s + Number(l.quantity || 0),
                    0,
                )
                const accepted = q.lines.reduce(
                    (s, l) => s + Number(l.passQuantity || 0),
                    0,
                )
                return {
                    id: q.id,
                    documentNumber: q.inspectionNumber,
                    status: q.status,
                    result: q.result,
                    createdAt: q.createdAt,
                    goodsReceiptId: q.goodsReceiptId,
                    receivedQuantity: received,
                    acceptedQuantity: accepted,
                    acceptanceRate: received > 0 ? accepted / received : null,
                }
            }),
            returns,
            pricing: {
                catalog: prices,
                invoicePriceVariance: pricingHistory,
            },
            manualAssessments,
            note: 'Calculated scores are system-derived from MM transactions and cannot be overwritten. Manual assessments are stored separately.',
        }
    }

    async compare(query: {
        companyId: string
        supplierIds: string[]
        periodStart?: string
        periodEnd?: string
    }) {
        const where: any = {
            companyId: query.companyId,
            supplierId: { in: query.supplierIds },
        }
        if (query.periodStart && query.periodEnd) {
            where.periodStart = new Date(query.periodStart)
            where.periodEnd = new Date(query.periodEnd)
        }

        let rows = await this.prisma.mmSupplierEvaluation.findMany({
            where,
            include: EVAL_INCLUDE,
            orderBy: { periodEnd: 'desc' },
        })

        // Latest evaluation per supplier when period not pinned
        if (!query.periodStart || !query.periodEnd) {
            const seen = new Set<string>()
            rows = rows.filter((r) => {
                if (seen.has(r.supplierId)) return false
                seen.add(r.supplierId)
                return true
            })
        }

        const ranked = compareSupplierScores(
            rows.map((r) => ({
                supplierId: r.supplierId,
                overallScore: Number(r.overallScore),
                deliveryScore: Number(r.deliveryScore),
                qualityScore: Number(r.qualityScore),
                priceScore: Number(r.priceScore),
                quantityScore: Number(r.quantityScore),
                returnRate: Number(r.returnRate),
            })),
        )

        const byId = new Map(rows.map((r) => [r.supplierId, r]))
        return {
            companyId: query.companyId,
            data: ranked.map((r) => ({
                ...r,
                evaluation: byId.get(r.supplierId) ?? null,
                supplier: byId.get(r.supplierId)?.supplier ?? null,
            })),
        }
    }
}

function dayMs(d: Date) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).getTime()
}
