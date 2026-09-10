import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { MatchToleranceService } from './match-tolerance.service'
import { SupplierInvoiceService } from './supplier-invoice.service'
import { ApproveInvoiceDto } from './dto/three-way-match.dto'

type LineOutcome = {
    lineId: string
    matchStatus: string
    matchedQuantity: Decimal
    quantityVariance: Decimal
    priceVariance: Decimal
    taxVariance: Decimal
    exceptions: Array<{
        varianceType: string
        severity: string
        message: string
        poSnapshot: any
        grSnapshot: any
        invoiceSnapshot: any
    }>
}

@Injectable()
export class ThreeWayMatchService {
    constructor(
        private prisma: PrismaService,
        private tolerances: MatchToleranceService,
        private invoices: SupplierInvoiceService,
        private events: EventEmitter2,
    ) {}

    async matchPreview(invoiceId: string) {
        const inv = await this.invoices.findOne(invoiceId)
        const outcomes = await this.evaluate(inv)
        return {
            invoiceId,
            headerStatus: this.rollUp(outcomes),
            lines: outcomes,
        }
    }

    async runMatch(invoiceId: string) {
        const inv = await this.invoices.findOne(invoiceId)
        if (!['SUBMITTED', 'VARIANCE', 'BLOCKED', 'PARTIALLY_MATCHED'].includes(inv.status)) {
            throw new BadRequestException(
                `Cannot run match from status ${inv.status}`,
            )
        }

        const outcomes = await this.evaluate(inv)
        const headerStatus = this.rollUp(outcomes)

        // Clear prior open exceptions for re-run
        await this.prisma.mmMatchException.deleteMany({
            where: { invoiceId, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
        })

        for (const o of outcomes) {
            await this.prisma.mmSupplierInvoiceLine.update({
                where: { id: o.lineId },
                data: {
                    matchStatus: o.matchStatus,
                    matchedQuantity: o.matchedQuantity,
                    quantityVariance: o.quantityVariance,
                    priceVariance: o.priceVariance,
                    taxVariance: o.taxVariance,
                },
            })

            for (const ex of o.exceptions) {
                const created = await this.prisma.mmMatchException.create({
                    data: {
                        invoiceId,
                        invoiceLineId: o.lineId,
                        purchaseOrderId: inv.purchaseOrderId,
                        varianceType: ex.varianceType,
                        severity: ex.severity,
                        message: ex.message,
                        poSnapshot: ex.poSnapshot,
                        grSnapshot: ex.grSnapshot,
                        invoiceSnapshot: ex.invoiceSnapshot,
                        status: 'OPEN',
                        paymentBlocked: true,
                        notifiedAt: new Date(),
                    },
                })
                this.events.emit('match.exception.created', created)
            }
        }

        const paymentEligible =
            headerStatus === 'MATCHED' || headerStatus === 'PARTIALLY_MATCHED'

        const updated = await this.prisma.mmSupplierInvoice.update({
            where: { id: invoiceId },
            data: {
                status: headerStatus,
                matchStatus: headerStatus,
                paymentEligible,
                matchedAt: paymentEligible ? new Date() : null,
            },
            include: {
                lines: true,
                exceptions: true,
                supplier: true,
                purchaseOrder: true,
            },
        })

        if (paymentEligible && !inv.invoicedApplied) {
            await this.applyInvoicedQuantities(inv, outcomes)
            await this.emitAccountingEvent({
                ...updated,
                lines: inv.lines.map((l: any) => {
                    const o = outcomes.find((x) => x.lineId === l.id)
                    return {
                        ...l,
                        matchStatus: o?.matchStatus ?? l.matchStatus,
                        matchedQuantity: o?.matchedQuantity ?? l.matchedQuantity,
                    }
                }),
            })
            await this.prisma.mmSupplierInvoice.update({
                where: { id: invoiceId },
                data: { invoicedApplied: true },
            })
        }

        return this.invoices.findOne(invoiceId)
    }

    async approve(invoiceId: string, dto: ApproveInvoiceDto = {}) {
        const inv = await this.invoices.findOne(invoiceId)
        if (!['MATCHED', 'PARTIALLY_MATCHED'].includes(inv.status)) {
            throw new BadRequestException(
                'Only MATCHED or PARTIALLY_MATCHED invoices can be approved',
            )
        }
        if (!inv.paymentEligible) {
            throw new BadRequestException('Invoice is not payment-eligible')
        }

        return this.prisma.mmSupplierInvoice.update({
            where: { id: invoiceId },
            data: {
                approvedBy: dto.approvedBy ?? null,
                approvedAt: new Date(),
            },
            include: {
                lines: true,
                exceptions: true,
                supplier: true,
                purchaseOrder: true,
            },
        })
    }

    private async evaluate(inv: any): Promise<LineOutcome[]> {
        const tol = await this.tolerances.resolveForPo(inv.purchaseOrderId)
        const po = await this.prisma.mmPurchaseOrder.findUnique({
            where: { id: inv.purchaseOrderId },
            include: { lines: true },
        })
        if (!po) throw new NotFoundException('Purchase order not found')

        const outcomes: LineOutcome[] = []

        // Header hard checks applied to all lines
        const headerExceptions: LineOutcome['exceptions'] = []
        if (inv.supplierId !== po.supplierId) {
            headerExceptions.push({
                varianceType: 'SUPPLIER',
                severity: 'BLOCKED',
                message: 'Invoice supplier does not match PO supplier',
                poSnapshot: { supplierId: po.supplierId, poNumber: po.poNumber },
                grSnapshot: null,
                invoiceSnapshot: {
                    supplierId: inv.supplierId,
                    invoiceNumber: inv.invoiceNumber,
                },
            })
        }
        const invCurrency = inv.currencyId ?? null
        const poCurrency = po.currencyId ?? null
        if (invCurrency && poCurrency && invCurrency !== poCurrency) {
            headerExceptions.push({
                varianceType: 'CURRENCY',
                severity: 'BLOCKED',
                message: 'Invoice currency does not match PO currency',
                poSnapshot: { currencyId: poCurrency, poNumber: po.poNumber },
                grSnapshot: null,
                invoiceSnapshot: {
                    currencyId: invCurrency,
                    invoiceNumber: inv.invoiceNumber,
                },
            })
        }

        for (const line of inv.lines) {
            const exceptions = [...headerExceptions]
            const poLine = po.lines.find(
                (l: any) => l.id === line.purchaseOrderLineId,
            )
            let matchStatus = 'MATCHED'
            let matchedQuantity = new Decimal(0)
            let quantityVariance = new Decimal(0)
            let priceVariance = new Decimal(0)
            let taxVariance = new Decimal(0)

            const invQty = new Decimal(line.invoicedQuantity)
            const invPrice = new Decimal(line.unitPrice)
            const invTax = new Decimal(line.taxAmount)

            if (!poLine) {
                exceptions.push({
                    varianceType: 'MATERIAL',
                    severity: 'BLOCKED',
                    message: 'PO line missing for invoice line',
                    poSnapshot: { purchaseOrderLineId: line.purchaseOrderLineId },
                    grSnapshot: null,
                    invoiceSnapshot: { lineId: line.id },
                })
                outcomes.push({
                    lineId: line.id,
                    matchStatus: 'BLOCKED',
                    matchedQuantity: new Decimal(0),
                    quantityVariance: invQty,
                    priceVariance: new Decimal(0),
                    taxVariance: new Decimal(0),
                    exceptions,
                })
                continue
            }

            if (poLine.materialId !== line.materialId) {
                exceptions.push({
                    varianceType: 'MATERIAL',
                    severity: 'BLOCKED',
                    message: 'Invoice material does not match PO line material',
                    poSnapshot: {
                        materialId: poLine.materialId,
                        lineNumber: poLine.lineNumber,
                    },
                    grSnapshot: null,
                    invoiceSnapshot: {
                        materialId: line.materialId,
                        lineNumber: line.lineNumber,
                    },
                })
            }

            const allocatedGr = (line.receipts ?? []).reduce(
                (s: Decimal, r: any) => s.plus(r.allocatedQuantity),
                new Decimal(0),
            )
            const grLines = (line.receipts ?? []).map((r: any) => ({
                goodsReceiptLineId: r.goodsReceiptLineId,
                documentNumber: r.goodsReceiptLine?.receipt?.documentNumber,
                allocatedQuantity: Number(r.allocatedQuantity),
                grQuantity: Number(r.goodsReceiptLine?.quantity ?? 0),
            }))

            // Quantity: invoice vs allocated GR
            const qtyTolAbs = allocatedGr.mul(tol.quantityTolerancePct).div(100)
            const qtyDiffOverGr = invQty.minus(allocatedGr)
            if (qtyDiffOverGr.gt(qtyTolAbs)) {
                quantityVariance = qtyDiffOverGr
                exceptions.push({
                    varianceType: 'QUANTITY',
                    severity: 'BLOCKED',
                    message: `Invoiced qty ${invQty} exceeds received qty ${allocatedGr} beyond tolerance`,
                    poSnapshot: {
                        poLineId: poLine.id,
                        poQty: Number(poLine.quantity),
                        receivedQuantity: Number(poLine.receivedQuantity),
                        invoicedQuantity: Number(poLine.invoicedQuantity),
                    },
                    grSnapshot: { allocatedGr: Number(allocatedGr), lines: grLines },
                    invoiceSnapshot: {
                        invoicedQuantity: Number(invQty),
                        lineNumber: line.lineNumber,
                    },
                })
            }

            // Price
            const poPrice = new Decimal(poLine.unitPrice)
            const priceDiff = invPrice.minus(poPrice).abs()
            const priceTol = Decimal.max(
                poPrice.mul(tol.priceTolerancePct).div(100),
                tol.absoluteToleranceAmount,
            )
            if (priceDiff.gt(priceTol)) {
                priceVariance = invPrice.minus(poPrice)
                exceptions.push({
                    varianceType: 'PRICE',
                    severity: 'BLOCKED',
                    message: `Invoice unit price ${invPrice} vs PO ${poPrice} exceeds tolerance`,
                    poSnapshot: { unitPrice: Number(poPrice) },
                    grSnapshot: null,
                    invoiceSnapshot: { unitPrice: Number(invPrice) },
                })
            }

            // Tax — expected proportional to PO line tax * (invQty / poQty)
            const poQty = new Decimal(poLine.quantity)
            const expectedTax = poQty.gt(0)
                ? new Decimal(poLine.tax).mul(invQty).div(poQty)
                : new Decimal(0)
            taxVariance = invTax.minus(expectedTax)
            const taxTol = Decimal.max(
                expectedTax.mul(tol.priceTolerancePct).div(100),
                tol.absoluteToleranceAmount,
            )
            if (taxVariance.abs().gt(taxTol)) {
                exceptions.push({
                    varianceType: 'TAX',
                    severity: 'BLOCKED',
                    message: `Invoice tax ${invTax} vs expected ${expectedTax} exceeds tolerance`,
                    poSnapshot: {
                        poTax: Number(poLine.tax),
                        expectedTax: Number(expectedTax),
                    },
                    grSnapshot: null,
                    invoiceSnapshot: { taxAmount: Number(invTax) },
                })
            }

            const hasBlocked = exceptions.some((e) => e.severity === 'BLOCKED')
            const hasVariance = exceptions.length > 0

            if (hasBlocked) {
                matchStatus = 'BLOCKED'
                matchedQuantity = new Decimal(0)
            } else if (hasVariance) {
                matchStatus = 'VARIANCE'
                matchedQuantity = new Decimal(0)
            } else {
                matchedQuantity = invQty
                const remainingReceivable = new Decimal(poLine.receivedQuantity)
                    .minus(poLine.invoicedQuantity)
                // Progressive invoice against open receivable
                if (
                    remainingReceivable.gt(0) &&
                    invQty.lt(remainingReceivable) &&
                    !qtyDiffOverGr.gt(qtyTolAbs)
                ) {
                    matchStatus = 'PARTIALLY_MATCHED'
                } else {
                    matchStatus = 'MATCHED'
                }
            }

            outcomes.push({
                lineId: line.id,
                matchStatus,
                matchedQuantity,
                quantityVariance,
                priceVariance,
                taxVariance,
                exceptions,
            })
        }

        return outcomes
    }

    private rollUp(outcomes: LineOutcome[]): string {
        if (outcomes.some((o) => o.matchStatus === 'BLOCKED')) return 'BLOCKED'
        if (outcomes.some((o) => o.matchStatus === 'VARIANCE')) return 'VARIANCE'
        if (outcomes.some((o) => o.matchStatus === 'PARTIALLY_MATCHED')) {
            return 'PARTIALLY_MATCHED'
        }
        return 'MATCHED'
    }

    private async applyInvoicedQuantities(inv: any, outcomes: LineOutcome[]) {
        for (const o of outcomes) {
            if (!['MATCHED', 'PARTIALLY_MATCHED'].includes(o.matchStatus)) {
                continue
            }
            const line = inv.lines.find((l: any) => l.id === o.lineId)
            if (!line) continue
            const qty = o.matchedQuantity
            await this.prisma.mmPurchaseOrderLine.update({
                where: { id: line.purchaseOrderLineId },
                data: { invoicedQuantity: { increment: qty } },
            })
        }
    }

    private async emitAccountingEvent(inv: any) {
        const payload = {
            sourceModule: 'THREE_WAY_MATCH',
            documentType: 'SUPPLIER_INVOICE',
            documentId: inv.id,
            companyId: inv.companyId,
            supplierId: inv.supplierId,
            purchaseOrderId: inv.purchaseOrderId,
            paymentEligible: true,
            eventHint: 'AP_INVOICE_MATCHED',
            lines: (inv.lines ?? []).map((l: any) => ({
                materialId: l.materialId,
                purchaseOrderLineId: l.purchaseOrderLineId,
                quantity: Number(l.invoicedQuantity),
                unitPrice: Number(l.unitPrice),
                taxAmount: Number(l.taxAmount),
                lineTotal: Number(l.lineTotal),
            })),
        }

        await this.prisma.mmAccountingEvent.create({
            data: {
                eventType: 'SUPPLIER_INVOICE_MATCHED',
                sourceModule: 'THREE_WAY_MATCH',
                documentType: 'SUPPLIER_INVOICE',
                documentId: inv.id,
                companyId: inv.companyId,
                payload,
                status: 'PENDING',
            },
        })
        this.events.emit('accounting.entry.requested', payload)
    }
}
