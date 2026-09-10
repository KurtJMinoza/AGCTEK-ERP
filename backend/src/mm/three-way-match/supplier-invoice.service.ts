import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    CreateSupplierInvoiceDto,
    UpdateSupplierInvoiceDto,
    SupplierInvoiceQueryDto,
} from './dto/three-way-match.dto'

const INVOICE_INCLUDES = {
    supplier: true,
    purchaseOrder: { include: { currency: true, supplier: true } },
    currency: true,
    lines: {
        include: {
            material: true,
            purchaseOrderLine: true,
            receipts: {
                include: {
                    goodsReceiptLine: {
                        include: { receipt: true },
                    },
                },
            },
        },
        orderBy: { lineNumber: 'asc' as const },
    },
    exceptions: true,
}

@Injectable()
export class SupplierInvoiceService {
    constructor(private prisma: PrismaService) {}

    async findAll(query: SupplierInvoiceQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 20
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.supplierId) where.supplierId = query.supplierId
        if (query.purchaseOrderId) where.purchaseOrderId = query.purchaseOrderId
        if (query.status) where.status = query.status
        if (query.search) {
            where.invoiceNumber = {
                contains: query.search,
                mode: 'insensitive',
            }
        }

        const [data, total] = await Promise.all([
            this.prisma.mmSupplierInvoice.findMany({
                where,
                include: {
                    supplier: true,
                    purchaseOrder: true,
                    currency: true,
                    _count: { select: { lines: true, exceptions: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmSupplierInvoice.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const inv = await this.prisma.mmSupplierInvoice.findUnique({
            where: { id },
            include: INVOICE_INCLUDES,
        })
        if (!inv) throw new NotFoundException('Supplier invoice not found')
        return inv
    }

    async create(dto: CreateSupplierInvoiceDto) {
        if (!dto.lines?.length) {
            throw new BadRequestException('At least one invoice line is required')
        }

        const po = await this.prisma.mmPurchaseOrder.findUnique({
            where: { id: dto.purchaseOrderId },
            include: { lines: true },
        })
        if (!po) throw new BadRequestException('Purchase order not found')
        if (po.companyId !== dto.companyId) {
            throw new BadRequestException('PO company mismatch')
        }
        if (po.supplierId !== dto.supplierId) {
            throw new BadRequestException(
                'Invoice supplier must match purchase order supplier',
            )
        }

        await this.validateLines(dto.lines, po)

        const invoiceNumber = await this.generateInvoiceNumber()
        let totalAmount = new Decimal(0)
        let taxAmount = new Decimal(dto.taxAmount ?? 0)

        const lineCreates = dto.lines.map((l, idx) => {
            const qty = new Decimal(l.invoicedQuantity)
            const price = new Decimal(l.unitPrice)
            const tax = new Decimal(l.taxAmount ?? 0)
            const lineTotal = qty.mul(price).plus(tax)
            totalAmount = totalAmount.plus(lineTotal)
            if (dto.taxAmount === undefined) taxAmount = taxAmount.plus(tax)

            return {
                lineNumber: idx + 1,
                materialId: l.materialId,
                purchaseOrderLineId: l.purchaseOrderLineId,
                uomId: l.uomId,
                invoicedQuantity: qty,
                unitPrice: price,
                taxAmount: tax,
                lineTotal,
                remarks: l.remarks ?? null,
                receipts: {
                    create: l.receipts.map((r) => ({
                        goodsReceiptLineId: r.goodsReceiptLineId,
                        allocatedQuantity: new Decimal(r.allocatedQuantity),
                    })),
                },
            }
        })

        return this.prisma.mmSupplierInvoice.create({
            data: {
                invoiceNumber,
                companyId: dto.companyId,
                supplierId: dto.supplierId,
                purchaseOrderId: dto.purchaseOrderId,
                currencyId: dto.currencyId ?? po.currencyId ?? null,
                invoiceDate: new Date(dto.invoiceDate),
                postingDate: dto.postingDate ? new Date(dto.postingDate) : null,
                taxAmount,
                totalAmount,
                status: 'DRAFT',
                createdBy: dto.createdBy ?? null,
                remarks: dto.remarks ?? null,
                lines: { create: lineCreates },
            },
            include: INVOICE_INCLUDES,
        })
    }

    async update(id: string, dto: UpdateSupplierInvoiceDto) {
        const inv = await this.findOne(id)
        if (inv.status !== 'DRAFT') {
            throw new BadRequestException('Only DRAFT invoices can be updated')
        }

        if (dto.lines) {
            const po = await this.prisma.mmPurchaseOrder.findUnique({
                where: { id: inv.purchaseOrderId },
                include: { lines: true },
            })
            if (!po) throw new BadRequestException('Purchase order not found')
            await this.validateLines(dto.lines, po)

            await this.prisma.mmSupplierInvoiceLineReceipt.deleteMany({
                where: { invoiceLine: { invoiceId: id } },
            })
            await this.prisma.mmSupplierInvoiceLine.deleteMany({
                where: { invoiceId: id },
            })

            let totalAmount = new Decimal(0)
            let taxAmount = new Decimal(dto.taxAmount ?? 0)
            for (let i = 0; i < dto.lines.length; i++) {
                const l = dto.lines[i]
                const qty = new Decimal(l.invoicedQuantity)
                const price = new Decimal(l.unitPrice)
                const tax = new Decimal(l.taxAmount ?? 0)
                const lineTotal = qty.mul(price).plus(tax)
                totalAmount = totalAmount.plus(lineTotal)
                if (dto.taxAmount === undefined) taxAmount = taxAmount.plus(tax)

                await this.prisma.mmSupplierInvoiceLine.create({
                    data: {
                        invoiceId: id,
                        lineNumber: i + 1,
                        materialId: l.materialId,
                        purchaseOrderLineId: l.purchaseOrderLineId,
                        uomId: l.uomId,
                        invoicedQuantity: qty,
                        unitPrice: price,
                        taxAmount: tax,
                        lineTotal,
                        remarks: l.remarks ?? null,
                        receipts: {
                            create: l.receipts.map((r) => ({
                                goodsReceiptLineId: r.goodsReceiptLineId,
                                allocatedQuantity: new Decimal(
                                    r.allocatedQuantity,
                                ),
                            })),
                        },
                    },
                })
            }

            return this.prisma.mmSupplierInvoice.update({
                where: { id },
                data: {
                    invoiceDate: dto.invoiceDate
                        ? new Date(dto.invoiceDate)
                        : undefined,
                    postingDate:
                        dto.postingDate !== undefined
                            ? dto.postingDate
                                ? new Date(dto.postingDate)
                                : null
                            : undefined,
                    taxAmount,
                    totalAmount,
                    currencyId: dto.currencyId ?? undefined,
                    remarks: dto.remarks ?? undefined,
                },
                include: INVOICE_INCLUDES,
            })
        }

        return this.prisma.mmSupplierInvoice.update({
            where: { id },
            data: {
                invoiceDate: dto.invoiceDate
                    ? new Date(dto.invoiceDate)
                    : undefined,
                postingDate:
                    dto.postingDate !== undefined
                        ? dto.postingDate
                            ? new Date(dto.postingDate)
                            : null
                        : undefined,
                taxAmount:
                    dto.taxAmount !== undefined
                        ? new Decimal(dto.taxAmount)
                        : undefined,
                currencyId: dto.currencyId ?? undefined,
                remarks: dto.remarks ?? undefined,
            },
            include: INVOICE_INCLUDES,
        })
    }

    async submit(id: string) {
        const inv = await this.findOne(id)
        if (inv.status !== 'DRAFT') {
            throw new BadRequestException('Only DRAFT invoices can be submitted')
        }
        if (!inv.lines.length) {
            throw new BadRequestException('Invoice has no lines')
        }
        return this.prisma.mmSupplierInvoice.update({
            where: { id },
            data: { status: 'SUBMITTED' },
            include: INVOICE_INCLUDES,
        })
    }

    private async validateLines(lines: CreateSupplierInvoiceDto['lines'], po: any) {
        const poLineMap = new Map(po.lines.map((l: any) => [l.id, l]))

        for (const line of lines) {
            const poLine: any = poLineMap.get(line.purchaseOrderLineId)
            if (!poLine) {
                throw new BadRequestException(
                    `PO line ${line.purchaseOrderLineId} not on purchase order`,
                )
            }
            if (poLine.materialId !== line.materialId) {
                throw new BadRequestException(
                    'Invoice line material must match PO line material',
                )
            }
            if (!line.receipts?.length) {
                throw new BadRequestException(
                    'Each invoice line requires at least one GR allocation',
                )
            }

            let allocSum = new Decimal(0)
            for (const r of line.receipts) {
                const grLine = await this.prisma.mmGoodsReceiptLine.findUnique({
                    where: { id: r.goodsReceiptLineId },
                    include: { receipt: true },
                })
                if (!grLine) {
                    throw new BadRequestException(
                        `Goods receipt line ${r.goodsReceiptLineId} not found`,
                    )
                }
                if (grLine.receipt.status !== 'POSTED') {
                    throw new BadRequestException(
                        'Only POSTED goods receipt lines can be allocated',
                    )
                }
                if (
                    grLine.receipt.purchaseOrderId &&
                    grLine.receipt.purchaseOrderId !== po.id
                ) {
                    throw new BadRequestException(
                        'GR does not belong to the invoice purchase order',
                    )
                }
                if (
                    grLine.purchaseOrderLineId &&
                    grLine.purchaseOrderLineId !== line.purchaseOrderLineId
                ) {
                    throw new BadRequestException(
                        'GR line is not linked to the invoice PO line',
                    )
                }
                allocSum = allocSum.plus(r.allocatedQuantity)
            }
        }
    }

    private async generateInvoiceNumber(): Promise<string> {
        const today = new Date()
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
        const prefix = `SINV-${dateStr}-`
        const last = await this.prisma.mmSupplierInvoice.findFirst({
            where: { invoiceNumber: { startsWith: prefix } },
            orderBy: { invoiceNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.invoiceNumber.replace(prefix, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${prefix}${String(seq).padStart(5, '0')}`
    }
}
