import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    AwardRfqDto,
    CreateRfqDto,
    CreateRfqFromPrDto,
    InviteSuppliersDto,
} from './dto/create-rfq.dto'
import { RfqQueryDto } from './dto/rfq-query.dto'
import { SaveQuotationComparisonDto } from './dto/quotation-comparison.dto'
import {
    assertSupplierProcurementById,
    assertCompetitiveSourcing,
} from '../procurement/assert-supplier-procurement'

const RFQ_INCLUDES = {
    company: { select: { id: true, code: true, name: true } },
    currency: { select: { id: true, code: true, name: true, symbol: true } },
    purchaseRequisition: {
        select: { id: true, requisitionNumber: true, status: true },
    },
    lines: {
        orderBy: { lineNumber: 'asc' as const },
        include: {
            material: { select: { id: true, materialCode: true, materialName: true } },
            uom: { select: { id: true, code: true, name: true } },
        },
    },
    invitedSuppliers: {
        include: {
            supplier: {
                select: {
                    id: true,
                    supplierCode: true,
                    supplierName: true,
                    status: true,
                },
            },
        },
    },
    quotations: {
        include: {
            supplier: {
                select: { id: true, supplierCode: true, supplierName: true },
            },
            paymentTerms: { select: { id: true, code: true, name: true, dueDays: true } },
            currency: { select: { id: true, code: true, symbol: true } },
            lines: {
                include: {
                    material: { select: { id: true, materialCode: true, materialName: true } },
                    uom: { select: { id: true, code: true } },
                },
            },
        },
    },
    awards: {
        orderBy: { evaluatedAt: 'desc' as const },
        include: {
            supplier: {
                select: { id: true, supplierCode: true, supplierName: true },
            },
            quotation: {
                select: { id: true, quotationNumber: true, total: true },
            },
        },
    },
}

@Injectable()
export class RfqService {
    constructor(private prisma: PrismaService) {}

    async create(dto: CreateRfqDto) {
        const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } })
        if (!company) throw new BadRequestException('Invalid company')

        const { assertPurchasableMaterials } = await import('../materials/assert-purchasable-materials')
        await assertPurchasableMaterials(
            this.prisma,
            dto.lines.map((l) => l.materialId),
        )

        const rfqNumber = await this.generateRfqNumber()
        const rfq = await this.prisma.mmRfq.create({
            data: {
                rfqNumber,
                companyId: dto.companyId,
                buyerId: dto.buyerId,
                responseDeadline: new Date(dto.responseDeadline),
                currencyId: dto.currencyId || null,
                purpose: dto.purpose?.trim() || null,
                notes: dto.notes?.trim() || null,
                autoSelectCheapest: dto.autoSelectCheapest ?? false,
                purchaseRequisitionId: dto.purchaseRequisitionId || null,
                status: 'DRAFT',
                createdBy: dto.createdBy || null,
                lines: {
                    create: dto.lines.map((l, idx) => ({
                        lineNumber: idx + 1,
                        materialId: l.materialId,
                        quantity: new Decimal(l.quantity),
                        uomId: l.uomId,
                        requiredDate: l.requiredDate ? new Date(l.requiredDate) : null,
                        specifications: l.specifications?.trim() || null,
                        prLineId: l.prLineId || null,
                    })),
                },
                invitedSuppliers: dto.supplierIds?.length
                    ? {
                          create: dto.supplierIds.map((supplierId) => ({
                              supplierId,
                              responseStatus: 'INVITED',
                          })),
                      }
                    : undefined,
            },
            include: RFQ_INCLUDES,
        })

        await this.audit(rfq.id, 'CREATED', null, null, rfqNumber, dto.createdBy)
        return rfq
    }

    async createFromPr(dto: CreateRfqFromPrDto) {
        const pr = await this.prisma.mmPurchaseRequisition.findFirst({
            where: { id: dto.purchaseRequisitionId },
            include: { lines: true, company: true },
        })
        if (!pr) throw new NotFoundException('Purchase requisition not found')

        const allowed = ['APPROVED', 'PARTIALLY_CONVERTED']
        if (!allowed.includes(pr.status)) {
            throw new BadRequestException(`Cannot create RFQ from PR in status ${pr.status}`)
        }

        const selected = pr.lines.filter((l) => dto.prLineIds.includes(l.id))
        if (selected.length === 0) {
            throw new BadRequestException('No matching PR lines selected')
        }
        for (const line of selected) {
            const remaining = new Decimal(line.requestedQuantity).minus(line.convertedQty)
            if (remaining.lte(0)) {
                throw new BadRequestException(
                    `PR line ${line.id} has no remaining quantity to convert`,
                )
            }
        }

        const supplierIds = [
            ...new Set([
                ...(dto.supplierIds ?? []),
                ...selected
                    .map((l) => l.preferredSupplierId)
                    .filter((id): id is string => Boolean(id)),
            ]),
        ]

        const rfq = await this.create({
            companyId: pr.companyId,
            buyerId: dto.buyerId,
            responseDeadline: dto.responseDeadline,
            currencyId: dto.currencyId,
            purpose: dto.purpose ?? pr.purpose,
            autoSelectCheapest: dto.autoSelectCheapest ?? false,
            purchaseRequisitionId: pr.id,
            createdBy: dto.createdBy,
            supplierIds,
            lines: selected.map((l) => ({
                materialId: l.materialId,
                quantity: Number(l.requestedQuantity) - Number(l.convertedQty),
                uomId: l.uomId,
                requiredDate: l.requiredDate.toISOString(),
                specifications: l.description || undefined,
                prLineId: l.id,
            })),
        })

        // Record PR conversions pointing at this RFQ
        for (const line of selected) {
            const remaining = new Decimal(line.requestedQuantity).minus(line.convertedQty)
            if (remaining.lte(0)) continue
            await this.prisma.mmPrConversion.create({
                data: {
                    requisitionId: pr.id,
                    lineId: line.id,
                    targetType: 'RFQ',
                    targetId: rfq.id,
                    convertedQty: remaining,
                    convertedBy: dto.createdBy ?? null,
                },
            })
            await this.prisma.mmPurchaseRequisitionLine.update({
                where: { id: line.id },
                data: { convertedQty: new Decimal(line.requestedQuantity) },
            })
        }

        const refreshedPr = await this.prisma.mmPurchaseRequisition.findUnique({
            where: { id: pr.id },
            include: { lines: true },
        })
        if (refreshedPr) {
            const allConverted = refreshedPr.lines.every((l) =>
                new Decimal(l.convertedQty).gte(new Decimal(l.requestedQuantity)),
            )
            await this.prisma.mmPurchaseRequisition.update({
                where: { id: pr.id },
                data: { status: allConverted ? 'FULLY_CONVERTED' : 'PARTIALLY_CONVERTED' },
            })
        }

        return this.findOne(rfq.id)
    }

    async findAll(query: RfqQueryDto) {
        const where: any = {}
        if (query.status) where.status = query.status
        if (query.companyId) where.companyId = query.companyId
        if (query.search) {
            where.OR = [
                { rfqNumber: { contains: query.search, mode: 'insensitive' } },
                { purpose: { contains: query.search, mode: 'insensitive' } },
                { buyerId: { contains: query.search, mode: 'insensitive' } },
            ]
        }

        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.mmRfq.findMany({
                where,
                include: {
                    company: { select: { id: true, name: true } },
                    currency: { select: { id: true, code: true, symbol: true } },
                    _count: {
                        select: {
                            lines: true,
                            invitedSuppliers: true,
                            quotations: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmRfq.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const rfq = await this.prisma.mmRfq.findUnique({
            where: { id },
            include: RFQ_INCLUDES,
        })
        if (!rfq) throw new NotFoundException('RFQ not found')
        return this.enrichExpired(rfq)
    }

    async update(id: string, dto: Partial<CreateRfqDto>) {
        const rfq = await this.findOneOrFail(id)
        if (rfq.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot update: RFQ is ${rfq.status}`)
        }

        const data: any = {}
        if (dto.buyerId !== undefined) data.buyerId = dto.buyerId
        if (dto.responseDeadline !== undefined) data.responseDeadline = new Date(dto.responseDeadline)
        if (dto.currencyId !== undefined) data.currencyId = dto.currencyId || null
        if (dto.purpose !== undefined) data.purpose = dto.purpose?.trim() || null
        if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null
        if (dto.autoSelectCheapest !== undefined) data.autoSelectCheapest = dto.autoSelectCheapest

        if (dto.lines) {
            await this.prisma.mmRfqLine.deleteMany({ where: { rfqId: id } })
            data.lines = {
                create: dto.lines.map((l, idx) => ({
                    lineNumber: idx + 1,
                    materialId: l.materialId,
                    quantity: new Decimal(l.quantity),
                    uomId: l.uomId,
                    requiredDate: l.requiredDate ? new Date(l.requiredDate) : null,
                    specifications: l.specifications?.trim() || null,
                    prLineId: l.prLineId || null,
                })),
            }
        }

        const updated = await this.prisma.mmRfq.update({
            where: { id },
            data,
            include: RFQ_INCLUDES,
        })
        await this.audit(id, 'UPDATED', null, null, null, dto.createdBy)
        return updated
    }

    async inviteSuppliers(id: string, dto: InviteSuppliersDto, performedBy?: string) {
        const rfq = await this.findOneOrFail(id)
        if (['AWARDED', 'CLOSED', 'CANCELLED'].includes(rfq.status)) {
            throw new BadRequestException(`Cannot invite suppliers: RFQ is ${rfq.status}`)
        }

        for (const supplierId of dto.supplierIds) {
            await assertSupplierProcurementById(this.prisma, supplierId, {
                companyId: rfq.companyId,
                purpose: 'RFQ_INVITE',
            })
            await this.prisma.mmRfqSupplier.upsert({
                where: { rfqId_supplierId: { rfqId: id, supplierId } },
                create: { rfqId: id, supplierId, responseStatus: 'INVITED' },
                update: {},
            })
        }

        await this.audit(id, 'SUPPLIERS_INVITED', null, null, dto.supplierIds.join(','), performedBy)
        return this.findOne(id)
    }

    async issue(id: string, performedBy?: string) {
        const rfq = await this.findOneOrFail(id)
        if (rfq.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot issue: RFQ is ${rfq.status}`)
        }
        if (rfq.lines.length === 0) throw new BadRequestException('RFQ has no lines')
        if (rfq.invitedSuppliers.length === 0) {
            throw new BadRequestException('Invite at least one supplier before issuing')
        }

        const updated = await this.prisma.mmRfq.update({
            where: { id },
            data: { status: 'ISSUED', issueDate: new Date() },
            include: RFQ_INCLUDES,
        })
        await this.audit(id, 'ISSUED', 'status', 'DRAFT', 'ISSUED', performedBy)
        return updated
    }

    async startEvaluation(id: string, performedBy?: string) {
        const rfq = await this.findOneOrFail(id)
        const allowed = ['ISSUED', 'PARTIALLY_RESPONDED', 'RESPONDED']
        if (!allowed.includes(rfq.status)) {
            throw new BadRequestException(`Cannot start evaluation: RFQ is ${rfq.status}`)
        }
        const submitted = rfq.quotations.filter((q) => q.status === 'SUBMITTED' || q.status === 'SELECTED')
        if (submitted.length === 0) {
            throw new BadRequestException('No submitted quotations to evaluate')
        }

        const updated = await this.prisma.mmRfq.update({
            where: { id },
            data: { status: 'EVALUATION' },
            include: RFQ_INCLUDES,
        })
        await this.audit(id, 'EVALUATION_STARTED', 'status', rfq.status, 'EVALUATION', performedBy)
        return updated
    }

    async getComparison(id: string) {
        const rfq = await this.findOne(id)
        const now = new Date()
        const rows = rfq.quotations.map((q) => {
            const expired = new Date(q.validityDate) < now && q.status !== 'SELECTED'
            const lineLead = q.lines
                .map((l) => l.leadTimeDays)
                .filter((d): d is number => d != null)
            const lineMoq = q.lines
                .map((l) => (l.moq != null ? Number(l.moq) : null))
                .filter((d): d is number => d != null)
            const avgUnitPrice =
                q.lines.length > 0
                    ? q.lines.reduce((s, l) => s + Number(l.unitPrice), 0) / q.lines.length
                    : 0

            return {
                quotationId: q.id,
                quotationNumber: q.quotationNumber,
                supplierId: q.supplierId,
                supplierCode: q.supplier.supplierCode,
                supplierName: q.supplier.supplierName,
                status: expired && q.status === 'SUBMITTED' ? 'EXPIRED' : q.status,
                expired,
                validityDate: q.validityDate,
                currency: q.currency,
                paymentTerms: q.paymentTerms,
                deliveryTerms: q.deliveryTerms,
                freight: Number(q.freight),
                tax: Number(q.tax),
                total: Number(q.total),
                /// Alias: lines + freight + header tax (same as total)
                landedCost: Number(q.total),
                avgUnitPrice,
                avgLeadTimeDays: lineLead.length
                    ? lineLead.reduce((a, b) => a + b, 0) / lineLead.length
                    : null,
                maxMoq: lineMoq.length ? Math.max(...lineMoq) : null,
                qualityScore: q.qualityScore != null ? Number(q.qualityScore) : null,
                supplierScore: q.supplierScore != null ? Number(q.supplierScore) : null,
                lineCount: q.lines.length,
                lines: q.lines.map((l) => ({
                    id: l.id,
                    rfqLineId: l.rfqLineId,
                    materialId: l.materialId,
                    materialCode: l.material.materialCode,
                    materialName: l.material.materialName,
                    quantity: Number(l.quantity),
                    unitPrice: Number(l.unitPrice),
                    discount: Number(l.discount),
                    tax: Number(l.tax),
                    lineTotal: Number(l.lineTotal),
                    leadTimeDays: l.leadTimeDays,
                    moq: l.moq != null ? Number(l.moq) : null,
                    warranty: l.warranty,
                })),
            }
        })

        const eligible = rows.filter((r) => r.status === 'SUBMITTED' && !r.expired)
        const cheapest =
            eligible.length > 0
                ? eligible.reduce((best, cur) => (cur.total < best.total ? cur : best))
                : null

        return {
            rfq: {
                id: rfq.id,
                rfqNumber: rfq.rfqNumber,
                status: rfq.status,
                autoSelectCheapest: rfq.autoSelectCheapest,
                responseDeadline: rfq.responseDeadline,
                lines: rfq.lines,
            },
            quotations: rows,
            cheapestQuotationId: cheapest?.quotationId ?? null,
            awardHint: rfq.autoSelectCheapest
                ? 'Auto-select cheapest is enabled for this RFQ.'
                : 'Manual supplier selection required — cheapest is not auto-awarded.',
        }
    }

    async saveComparison(dto: SaveQuotationComparisonDto) {
        const comparison = await this.getComparison(dto.rfqId)
        const saved = await this.prisma.mmQuotationComparison.create({
            data: {
                rfqId: dto.rfqId,
                comparedBy: dto.comparedBy ?? null,
                criteria: dto.criteria ?? [
                    'unitPrice',
                    'totalPrice',
                    'leadTime',
                    'moq',
                    'paymentTerms',
                    'delivery',
                    'supplierScore',
                ],
                results: comparison,
                selectedQuotationId: dto.selectedQuotationId ?? null,
                selectionReason: dto.selectionReason ?? null,
            },
        })
        await this.audit(
            dto.rfqId,
            'COMPARISON_SAVED',
            null,
            null,
            saved.id,
            dto.comparedBy,
            { selectedQuotationId: dto.selectedQuotationId, selectionReason: dto.selectionReason },
        )
        return saved
    }

    async award(id: string, dto: AwardRfqDto) {
        const rfq = await this.findOneOrFail(id)
        const allowed = ['EVALUATION', 'RESPONDED', 'PARTIALLY_RESPONDED', 'ISSUED']
        if (!allowed.includes(rfq.status)) {
            throw new BadRequestException(`Cannot award: RFQ is ${rfq.status}`)
        }

        let quotationId = dto.quotationId
        let supplierId = dto.supplierId
        let autoSelected = false

        if (dto.useCheapest) {
            if (!rfq.autoSelectCheapest) {
                throw new BadRequestException(
                    'Auto-select cheapest is not enabled for this RFQ. Select a supplier manually.',
                )
            }
            const comparison = await this.getComparison(id)
            if (!comparison.cheapestQuotationId) {
                throw new BadRequestException('No eligible submitted quotations to award')
            }
            quotationId = comparison.cheapestQuotationId
            autoSelected = true
        }

        if (!quotationId && !supplierId) {
            throw new BadRequestException('Provide quotationId or supplierId, or useCheapest')
        }

        let quotation = quotationId
            ? await this.prisma.mmSupplierQuotation.findUnique({ where: { id: quotationId } })
            : await this.prisma.mmSupplierQuotation.findFirst({
                  where: { rfqId: id, supplierId: supplierId!, status: 'SUBMITTED' },
              })

        if (!quotation || quotation.rfqId !== id) {
            throw new BadRequestException('Quotation not found on this RFQ')
        }

        const now = new Date()
        if (new Date(quotation.validityDate) < now && quotation.status !== 'SELECTED') {
            throw new BadRequestException('Cannot award an expired quotation')
        }
        if (!['SUBMITTED', 'SELECTED'].includes(quotation.status)) {
            throw new BadRequestException(`Cannot award quotation in status ${quotation.status}`)
        }

        supplierId = quotation.supplierId

        const awardedSupplier = await this.prisma.mmSupplier.findFirst({
            where: { id: supplierId! },
            select: { sourcingType: true },
        })
        const invitedSuppliers = await this.prisma.mmRfqSupplier.findMany({
            where: { rfqId: id },
            include: { supplier: { select: { sourcingType: true } } },
        })
        const submittedCount = rfq.quotations.filter(
            (q) => q.status === 'SUBMITTED' || q.status === 'SELECTED',
        ).length
        assertCompetitiveSourcing({
            submittedQuotationCount: submittedCount,
            awardedSupplierSourcingType: awardedSupplier?.sourcingType,
            invitedSupplierSourcingTypes: invitedSuppliers.map((s) => s.supplier.sourcingType),
            reason: dto.reason,
        })

        await assertSupplierProcurementById(this.prisma, supplierId!, {
            companyId: rfq.companyId,
            purpose: 'PO',
        })

        const award = await this.prisma.$transaction(async (tx) => {
            await tx.mmSupplierQuotation.updateMany({
                where: { rfqId: id, status: 'SELECTED' },
                data: { status: 'SUBMITTED' },
            })
            await tx.mmSupplierQuotation.update({
                where: { id: quotation!.id },
                data: { status: 'SELECTED' },
            })
            const created = await tx.mmRfqAward.create({
                data: {
                    rfqId: id,
                    supplierId: supplierId!,
                    quotationId: quotation!.id,
                    reason: dto.reason.trim(),
                    evaluatedBy: dto.evaluatedBy ?? null,
                    autoSelected,
                },
                include: {
                    supplier: { select: { id: true, supplierCode: true, supplierName: true } },
                    quotation: { select: { id: true, quotationNumber: true, total: true } },
                },
            })
            await tx.mmRfq.update({
                where: { id },
                data: { status: 'AWARDED' },
            })
            return created
        })

        await this.audit(
            id,
            'AWARDED',
            'status',
            rfq.status,
            'AWARDED',
            dto.evaluatedBy,
            { supplierId, quotationId: quotation.id, autoSelected, reason: dto.reason },
        )

        return { award, rfq: await this.findOne(id) }
    }

    async close(id: string, performedBy?: string) {
        const rfq = await this.findOneOrFail(id)
        if (!['AWARDED', 'EVALUATION', 'RESPONDED'].includes(rfq.status)) {
            throw new BadRequestException(`Cannot close: RFQ is ${rfq.status}`)
        }
        const updated = await this.prisma.mmRfq.update({
            where: { id },
            data: { status: 'CLOSED' },
            include: RFQ_INCLUDES,
        })
        await this.audit(id, 'CLOSED', 'status', rfq.status, 'CLOSED', performedBy)
        return updated
    }

    async cancel(id: string, performedBy?: string) {
        const rfq = await this.findOneOrFail(id)
        if (['AWARDED', 'CLOSED', 'CANCELLED'].includes(rfq.status)) {
            throw new BadRequestException(`Cannot cancel: RFQ is ${rfq.status}`)
        }
        const updated = await this.prisma.mmRfq.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: RFQ_INCLUDES,
        })
        await this.audit(id, 'CANCELLED', 'status', rfq.status, 'CANCELLED', performedBy)
        return updated
    }

    async getAudit(id: string) {
        await this.findOneOrFail(id)
        return this.prisma.mmRfqAudit.findMany({
            where: { rfqId: id },
            orderBy: { performedAt: 'desc' },
        })
    }

    /** Called by quotation service after submit/withdraw */
    async refreshResponseStatus(rfqId: string) {
        const rfq = await this.prisma.mmRfq.findUnique({
            where: { id: rfqId },
            include: {
                invitedSuppliers: true,
                quotations: true,
            },
        })
        if (!rfq) return
        if (['AWARDED', 'CLOSED', 'CANCELLED', 'DRAFT', 'EVALUATION'].includes(rfq.status)) return

        const invited = rfq.invitedSuppliers.length
        const responded = rfq.invitedSuppliers.filter((s) => s.responseStatus === 'RESPONDED').length
        let status = rfq.status
        if (responded === 0) status = 'ISSUED'
        else if (responded < invited) status = 'PARTIALLY_RESPONDED'
        else status = 'RESPONDED'

        if (status !== rfq.status) {
            await this.prisma.mmRfq.update({ where: { id: rfqId }, data: { status } })
        }
    }

    private enrichExpired<T extends { quotations?: Array<{ validityDate: Date; status: string }> }>(
        rfq: T,
    ): T {
        if (!rfq.quotations) return rfq
        const now = new Date()
        return {
            ...rfq,
            quotations: rfq.quotations.map((q) =>
                new Date(q.validityDate) < now && q.status === 'SUBMITTED'
                    ? { ...q, status: 'EXPIRED' }
                    : q,
            ),
        }
    }

    private async findOneOrFail(id: string) {
        const rfq = await this.prisma.mmRfq.findUnique({
            where: { id },
            include: RFQ_INCLUDES,
        })
        if (!rfq) throw new NotFoundException('RFQ not found')
        return rfq
    }

    private async audit(
        rfqId: string,
        action: string,
        field: string | null,
        oldValue: string | null,
        newValue: string | null,
        performedBy?: string,
        details?: any,
    ) {
        await this.prisma.mmRfqAudit.create({
            data: {
                rfqId,
                action,
                field,
                oldValue,
                newValue,
                performedBy: performedBy ?? null,
                details: details ?? undefined,
            },
        })
    }

    private async generateRfqNumber(): Promise<string> {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `RFQ-${dateStr}-`
        const last = await this.prisma.mmRfq.findFirst({
            where: { rfqNumber: { startsWith: pfx } },
            orderBy: { rfqNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const lastSeq = parseInt(last.rfqNumber.replace(pfx, ''), 10)
            if (!isNaN(lastSeq)) seq = lastSeq + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
