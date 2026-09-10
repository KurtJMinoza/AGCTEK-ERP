import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    CreateQuotationDto,
    UpdateQuotationScoresDto,
} from './dto/create-quotation.dto'
import { QuotationQueryDto } from './dto/rfq-query.dto'
import { RfqService } from './rfq.service'

const QUOTE_INCLUDES = {
    supplier: { select: { id: true, supplierCode: true, supplierName: true } },
    rfq: { select: { id: true, rfqNumber: true, status: true, responseDeadline: true } },
    currency: { select: { id: true, code: true, symbol: true } },
    paymentTerms: { select: { id: true, code: true, name: true, dueDays: true } },
    lines: {
        include: {
            material: { select: { id: true, materialCode: true, materialName: true } },
            uom: { select: { id: true, code: true, name: true } },
            rfqLine: { select: { id: true, lineNumber: true } },
        },
    },
}

@Injectable()
export class QuotationService {
    constructor(
        private prisma: PrismaService,
        private rfqService: RfqService,
    ) {}

    async create(dto: CreateQuotationDto) {
        const rfq = await this.prisma.mmRfq.findUnique({
            where: { id: dto.rfqId },
            include: { invitedSuppliers: true, lines: true },
        })
        if (!rfq) throw new NotFoundException('RFQ not found')
        if (['DRAFT', 'CANCELLED', 'CLOSED', 'AWARDED'].includes(rfq.status)) {
            throw new BadRequestException(`Cannot quote: RFQ is ${rfq.status}`)
        }

        const invited = rfq.invitedSuppliers.some((s) => s.supplierId === dto.supplierId)
        if (!invited) {
            throw new BadRequestException('Supplier was not invited to this RFQ')
        }

        const existing = await this.prisma.mmSupplierQuotation.findUnique({
            where: { rfqId_supplierId: { rfqId: dto.rfqId, supplierId: dto.supplierId } },
        })
        if (existing) {
            throw new BadRequestException('Supplier already has a quotation for this RFQ')
        }

        const { lines, lineSubtotal, taxTotal } = this.buildLines(dto)
        const freight = new Decimal(dto.freight ?? 0)
        const headerTax = new Decimal(dto.tax ?? taxTotal)
        const total = lineSubtotal.plus(freight).plus(headerTax)

        const quotationNumber = await this.generateQuotationNumber()
        return this.prisma.mmSupplierQuotation.create({
            data: {
                quotationNumber,
                rfqId: dto.rfqId,
                supplierId: dto.supplierId,
                validityDate: new Date(dto.validityDate),
                currencyId: dto.currencyId || rfq.currencyId || null,
                paymentTermsId: dto.paymentTermsId || null,
                deliveryTerms: dto.deliveryTerms?.trim() || null,
                freight,
                tax: headerTax,
                total,
                status: 'DRAFT',
                qualityScore: dto.qualityScore != null ? new Decimal(dto.qualityScore) : null,
                supplierScore: dto.supplierScore != null ? new Decimal(dto.supplierScore) : null,
                notes: dto.notes?.trim() || null,
                createdBy: dto.createdBy || null,
                lines: { create: lines },
            },
            include: QUOTE_INCLUDES,
        })
    }

    async findAll(query: QuotationQueryDto) {
        const where: any = {}
        if (query.rfqId) where.rfqId = query.rfqId
        if (query.supplierId) where.supplierId = query.supplierId
        if (query.status) where.status = query.status
        if (query.search) {
            where.OR = [
                { quotationNumber: { contains: query.search, mode: 'insensitive' } },
                { supplier: { supplierName: { contains: query.search, mode: 'insensitive' } } },
            ]
        }

        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [raw, total] = await Promise.all([
            this.prisma.mmSupplierQuotation.findMany({
                where,
                include: QUOTE_INCLUDES,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmSupplierQuotation.count({ where }),
        ])

        const data = raw.map((q) => this.markExpired(q))
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const q = await this.prisma.mmSupplierQuotation.findUnique({
            where: { id },
            include: QUOTE_INCLUDES,
        })
        if (!q) throw new NotFoundException('Quotation not found')
        return this.markExpired(q)
    }

    async update(id: string, dto: Partial<CreateQuotationDto>) {
        const existing = await this.prisma.mmSupplierQuotation.findUnique({
            where: { id },
            include: { lines: true },
        })
        if (!existing) throw new NotFoundException('Quotation not found')
        if (existing.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot update: quotation is ${existing.status}`)
        }

        const data: any = {}
        if (dto.validityDate) data.validityDate = new Date(dto.validityDate)
        if (dto.currencyId !== undefined) data.currencyId = dto.currencyId || null
        if (dto.paymentTermsId !== undefined) data.paymentTermsId = dto.paymentTermsId || null
        if (dto.deliveryTerms !== undefined) data.deliveryTerms = dto.deliveryTerms?.trim() || null
        if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null
        if (dto.qualityScore !== undefined) {
            data.qualityScore = dto.qualityScore != null ? new Decimal(dto.qualityScore) : null
        }
        if (dto.supplierScore !== undefined) {
            data.supplierScore = dto.supplierScore != null ? new Decimal(dto.supplierScore) : null
        }

        if (dto.lines) {
            const { lines, lineSubtotal, taxTotal } = this.buildLines(dto as CreateQuotationDto)
            const freight = new Decimal(dto.freight ?? existing.freight)
            const headerTax = new Decimal(dto.tax ?? taxTotal)
            data.freight = freight
            data.tax = headerTax
            data.total = lineSubtotal.plus(freight).plus(headerTax)
            await this.prisma.mmSupplierQuotationLine.deleteMany({ where: { quotationId: id } })
            data.lines = { create: lines }
        } else if (dto.freight !== undefined || dto.tax !== undefined) {
            const freight = new Decimal(dto.freight ?? existing.freight)
            const tax = new Decimal(dto.tax ?? existing.tax)
            const lineSub = existing.lines.reduce(
                (s, l) => s.plus(l.lineTotal),
                new Decimal(0),
            )
            data.freight = freight
            data.tax = tax
            data.total = lineSub.plus(freight).plus(tax)
        }

        return this.prisma.mmSupplierQuotation.update({
            where: { id },
            data,
            include: QUOTE_INCLUDES,
        })
    }

    async submit(id: string, performedBy?: string) {
        const q = await this.prisma.mmSupplierQuotation.findUnique({
            where: { id },
            include: { lines: true, rfq: true },
        })
        if (!q) throw new NotFoundException('Quotation not found')
        if (q.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot submit: quotation is ${q.status}`)
        }
        if (q.lines.length === 0) throw new BadRequestException('Quotation has no lines')
        if (new Date(q.validityDate) < new Date()) {
            throw new BadRequestException('Quotation validity date is already past')
        }
        if (['CANCELLED', 'CLOSED', 'AWARDED'].includes(q.rfq.status)) {
            throw new BadRequestException(`Cannot submit: RFQ is ${q.rfq.status}`)
        }

        const updated = await this.prisma.mmSupplierQuotation.update({
            where: { id },
            data: { status: 'SUBMITTED', submittedAt: new Date() },
            include: QUOTE_INCLUDES,
        })

        await this.prisma.mmRfqSupplier.updateMany({
            where: { rfqId: q.rfqId, supplierId: q.supplierId },
            data: { responseStatus: 'RESPONDED', respondedAt: new Date() },
        })

        await this.rfqService.refreshResponseStatus(q.rfqId)
        return updated
    }

    async withdraw(id: string) {
        const q = await this.prisma.mmSupplierQuotation.findUnique({ where: { id } })
        if (!q) throw new NotFoundException('Quotation not found')
        if (q.status !== 'SUBMITTED') {
            throw new BadRequestException(`Cannot withdraw: quotation is ${q.status}`)
        }

        const updated = await this.prisma.mmSupplierQuotation.update({
            where: { id },
            data: { status: 'WITHDRAWN' },
            include: QUOTE_INCLUDES,
        })

        await this.prisma.mmRfqSupplier.updateMany({
            where: { rfqId: q.rfqId, supplierId: q.supplierId },
            data: { responseStatus: 'DECLINED' },
        })
        await this.rfqService.refreshResponseStatus(q.rfqId)
        return updated
    }

    async updateScores(id: string, dto: UpdateQuotationScoresDto) {
        const q = await this.prisma.mmSupplierQuotation.findUnique({ where: { id } })
        if (!q) throw new NotFoundException('Quotation not found')
        return this.prisma.mmSupplierQuotation.update({
            where: { id },
            data: {
                qualityScore:
                    dto.qualityScore !== undefined
                        ? dto.qualityScore != null
                            ? new Decimal(dto.qualityScore)
                            : null
                        : undefined,
                supplierScore:
                    dto.supplierScore !== undefined
                        ? dto.supplierScore != null
                            ? new Decimal(dto.supplierScore)
                            : null
                        : undefined,
            },
            include: QUOTE_INCLUDES,
        })
    }

    private buildLines(dto: CreateQuotationDto) {
        let lineSubtotal = new Decimal(0)
        let taxTotal = new Decimal(0)
        const lines = dto.lines.map((l) => {
            const qty = new Decimal(l.quantity)
            const unitPrice = new Decimal(l.unitPrice)
            const discount = new Decimal(l.discount ?? 0)
            const tax = new Decimal(l.tax ?? 0)
            const lineTotal = qty.mul(unitPrice).minus(discount).plus(tax)
            lineSubtotal = lineSubtotal.plus(lineTotal)
            taxTotal = taxTotal.plus(tax)
            return {
                rfqLineId: l.rfqLineId || null,
                materialId: l.materialId,
                quantity: qty,
                uomId: l.uomId,
                unitPrice,
                discount,
                tax,
                lineTotal,
                leadTimeDays: l.leadTimeDays ?? null,
                moq: l.moq != null ? new Decimal(l.moq) : null,
                warranty: l.warranty?.trim() || null,
                notes: l.notes?.trim() || null,
            }
        })
        return { lines, lineSubtotal, taxTotal }
    }

    private markExpired<T extends { validityDate: Date; status: string }>(q: T): T {
        if (q.status === 'SUBMITTED' && new Date(q.validityDate) < new Date()) {
            return { ...q, status: 'EXPIRED' }
        }
        return q
    }

    private async generateQuotationNumber(): Promise<string> {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `SQ-${dateStr}-`
        const last = await this.prisma.mmSupplierQuotation.findFirst({
            where: { quotationNumber: { startsWith: pfx } },
            orderBy: { quotationNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const lastSeq = parseInt(last.quotationNumber.replace(pfx, ''), 10)
            if (!isNaN(lastSeq)) seq = lastSeq + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
