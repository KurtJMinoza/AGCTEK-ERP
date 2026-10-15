import { Injectable } from '@nestjs/common'
import PDFDocumentImport from 'pdfkit'
import {
    buildInvoicePdfModel,
    formatInvoiceMoney,
    type InvoicePdfInput,
    type InvoicePdfModel,
} from './sales-invoice-pdf.model'

/** pdfkit's typings export an instance; at runtime the module is the constructor. */
const PDFDocument = PDFDocumentImport as unknown as new (
    options?: PDFKit.PDFDocumentOptions,
) => PDFKit.PDFDocument

const COLOR = {
    text: '#111827',
    muted: '#6b7280',
    line: '#d1d5db',
    band: '#f3f4f6',
    success: '#15803d',
    danger: '#b91c1c',
    warning: '#b45309',
    watermark: '#e5e7eb',
} as const

const STATUS_COLOR: Record<string, string> = {
    DRAFT: COLOR.muted,
    UNPAID: COLOR.warning,
    OVERDUE: COLOR.danger,
    PAID: COLOR.success,
    CANCELLED: COLOR.muted,
    REFUNDED: COLOR.muted,
}

const MARGIN = 48
const FOOTER_BAND = 28

const money = formatInvoiceMoney

/**
 * Renders an SD customer invoice to a PDF. Read-only: never touches the invoice
 * or the sales order. Layout follows `QuotationPdfService`.
 */
@Injectable()
export class SalesInvoicePdfService {
    /** Un-ended PDF stream for the invoice. */
    createDocument(input: InvoicePdfInput, now = new Date()): PDFKit.PDFDocument {
        const model = buildInvoicePdfModel(input, now)
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: MARGIN, bottom: MARGIN + FOOTER_BAND, left: MARGIN, right: MARGIN },
            bufferPages: true,
            info: {
                Title: model.invoice.number,
                Author: model.company.name,
                Subject: `Invoice ${model.invoice.number} (${model.invoice.statusLabel})`,
            },
        })
        this.draw(doc, model)
        return doc
    }

    /** Full PDF bytes; nothing is persisted. */
    async render(input: InvoicePdfInput, now = new Date()): Promise<Buffer> {
        const doc = this.createDocument(input, now)
        const bytes = new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = []
            doc.on('data', (chunk: Buffer) => chunks.push(chunk))
            doc.on('end', () => resolve(Buffer.concat(chunks)))
            doc.on('error', reject)
        })
        doc.end()
        return bytes
    }

    private left(doc: PDFKit.PDFDocument) {
        return doc.page.margins.left
    }

    private contentWidth(doc: PDFKit.PDFDocument) {
        return doc.page.width - doc.page.margins.left - doc.page.margins.right
    }

    private pageBottom(doc: PDFKit.PDFDocument) {
        return doc.page.height - doc.page.margins.bottom
    }

    private draw(doc: PDFKit.PDFDocument, model: InvoicePdfModel) {
        this.drawHeader(doc, model)
        this.drawMeta(doc, model)
        this.drawTableHeader(doc)
        this.drawLines(doc, model)
        this.drawTotals(doc, model)
        this.drawNotes(doc, model)
        this.drawFooters(doc, model)
    }

    private drawHeader(doc: PDFKit.PDFDocument, model: InvoicePdfModel) {
        const left = this.left(doc)
        const width = this.contentWidth(doc)
        const top = doc.y

        doc.font('Helvetica-Bold').fontSize(20).fillColor(COLOR.text)
        doc.text(model.company.name, left, top, { width: width * 0.62 })
        doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted)
        if (model.company.address) doc.text(model.company.address, left, doc.y, { width: width * 0.62 })
        if (model.company.tin) doc.text(`TIN: ${model.company.tin}`, left, doc.y, { width: width * 0.62 })
        const leftBottom = doc.y

        doc.font('Helvetica-Bold').fontSize(22).fillColor(COLOR.text)
        doc.text('INVOICE', left, top, { width, align: 'right' })
        doc.font('Helvetica').fontSize(10).fillColor(COLOR.muted)
        doc.text(model.invoice.number, left, doc.y, { width, align: 'right' })
        doc.font('Helvetica-Bold')
            .fontSize(11)
            .fillColor(STATUS_COLOR[model.invoice.billingStatus] ?? COLOR.text)
        doc.text(model.invoice.statusLabel.toUpperCase(), left, doc.y, { width, align: 'right' })
        const rightBottom = doc.y

        doc.y = Math.max(leftBottom, rightBottom) + 10
        doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(COLOR.line).lineWidth(1).stroke()
        doc.y += 14
    }

    private drawMeta(doc: PDFKit.PDFDocument, model: InvoicePdfModel) {
        const left = this.left(doc)
        const width = this.contentWidth(doc)
        const colW = width / 2 - 12
        const top = doc.y

        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.muted).text('BILL TO', left, top)
        doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.text)
        doc.text(model.billTo.name, left, doc.y, { width: colW })
        doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted)
        for (const line of [...model.billTo.addressLines, model.billTo.email, model.billTo.phone]) {
            if (line) doc.text(line, left, doc.y, { width: colW })
        }
        const leftBottom = doc.y

        const rx = left + width / 2 + 8
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.muted).text('DETAILS', rx, top)
        doc.font('Helvetica').fontSize(9).fillColor(COLOR.text)
        const details = [
            `Invoice date: ${model.invoice.issueDate}`,
            model.invoice.dueDate ? `Due date: ${model.invoice.dueDate}` : null,
            model.invoice.paidDate ? `Paid on: ${model.invoice.paidDate}` : null,
            `Sales order: ${model.invoice.salesOrderNumber}`,
            model.invoice.paymentMethod ? `Payment method: ${model.invoice.paymentMethod}` : null,
        ]
        for (const line of details) if (line) doc.text(line, rx, doc.y, { width: colW })
        const rightBottom = doc.y

        doc.y = Math.max(leftBottom, rightBottom) + 16
    }

    private columns(doc: PDFKit.PDFDocument) {
        const left = this.left(doc)
        const width = this.contentWidth(doc)
        const noW = 26
        const skuW = 112
        const qtyW = 46
        const unitW = 84
        const amountW = 90
        const descW = width - (noW + skuW + qtyW + unitW + amountW)
        const no = left
        const sku = no + noW
        const desc = sku + skuW
        const qty = desc + descW
        const unit = qty + qtyW
        const amount = unit + unitW
        return { width, descW, noW, skuW, qtyW, unitW, amountW, no, sku, desc, qty, unit, amount }
    }

    private drawTableHeader(doc: PDFKit.PDFDocument) {
        const left = this.left(doc)
        const c = this.columns(doc)
        const y = doc.y
        doc.rect(left, y - 4, c.width, 20).fill(COLOR.band)
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR.muted)
        doc.text('#', c.no, y + 1, { width: c.noW })
        doc.text('SKU', c.sku, y + 1, { width: c.skuW })
        doc.text('DESCRIPTION', c.desc, y + 1, { width: c.descW })
        doc.text('QTY', c.qty, y + 1, { width: c.qtyW, align: 'right' })
        doc.text('UNIT PRICE', c.unit, y + 1, { width: c.unitW, align: 'right' })
        doc.text('AMOUNT', c.amount, y + 1, { width: c.amountW, align: 'right' })
        doc.y = y + 22
    }

    private drawLines(doc: PDFKit.PDFDocument, model: InvoicePdfModel) {
        const left = this.left(doc)
        const c = this.columns(doc)
        for (const line of model.lines) {
            const skuHeight = doc.font('Helvetica').fontSize(9).heightOfString(line.sku || '', {
                width: c.skuW - 4,
            })
            const descHeight = doc.font('Helvetica').fontSize(9).heightOfString(line.description || '', {
                width: c.descW - 6,
            })
            const rowHeight = Math.max(18, skuHeight + 6, descHeight + 6)
            if (doc.y + rowHeight > this.pageBottom(doc) - 12) {
                doc.addPage()
                doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.text)
                doc.text(`${model.invoice.number} (continued)`, left, doc.y)
                doc.y += 6
                this.drawTableHeader(doc)
            }
            const rowY = doc.y
            doc.font('Helvetica').fontSize(9).fillColor(COLOR.text)
            doc.text(String(line.lineNumber), c.no, rowY, { width: c.noW })
            doc.text(line.sku, c.sku, rowY, { width: c.skuW - 4 })
            doc.text(line.description, c.desc, rowY, { width: c.descW - 6 })
            doc.text(line.quantity, c.qty, rowY, { width: c.qtyW, align: 'right' })
            doc.text(money(line.unitPrice, model.currency), c.unit, rowY, { width: c.unitW, align: 'right' })
            doc.text(money(line.lineTotal, model.currency), c.amount, rowY, { width: c.amountW, align: 'right' })
            doc.y = rowY + rowHeight
            doc.moveTo(left, doc.y - 4)
                .lineTo(left + c.width, doc.y - 4)
                .strokeColor(COLOR.line)
                .lineWidth(0.5)
                .stroke()
        }
        doc.y += 8
    }

    private drawTotals(doc: PDFKit.PDFDocument, model: InvoicePdfModel) {
        const left = this.left(doc)
        const width = this.contentWidth(doc)
        const labelW = 130
        const valueW = 130
        const x = left + width - labelW - valueW
        const rows: Array<[string, number]> = [['Subtotal', model.totals.subtotal]]
        if (model.totals.discount) rows.push(['Discount', -model.totals.discount])
        if (model.totals.shipping) rows.push(['Shipping', model.totals.shipping])
        if (doc.y + rows.length * 16 + 60 > this.pageBottom(doc)) doc.addPage()

        let y = doc.y
        doc.font('Helvetica').fontSize(10)
        for (const [label, value] of rows) {
            doc.fillColor(COLOR.muted).text(label, x, y, { width: labelW, align: 'right' })
            doc.fillColor(COLOR.text).text(money(value, model.currency), x + labelW, y, {
                width: valueW,
                align: 'right',
            })
            y += 16
        }

        const totalY = y + 2
        doc.rect(x, totalY - 4, labelW + valueW, 24).fill(COLOR.band)
        doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.text)
        doc.text('Total due', x, totalY, { width: labelW, align: 'right' })
        doc.text(money(model.totals.total, model.currency), x + labelW, totalY, {
            width: valueW,
            align: 'right',
        })
        y = totalY + 28

        if (model.totals.refunded) {
            doc.font('Helvetica').fontSize(10).fillColor(COLOR.muted)
            doc.text('Refunded', x, y, { width: labelW, align: 'right' })
            doc.text(money(-model.totals.refunded, model.currency), x + labelW, y, {
                width: valueW,
                align: 'right',
            })
            y += 18
        }
        doc.y = y + 8
    }

    private drawNotes(doc: PDFKit.PDFDocument, model: InvoicePdfModel) {
        if (!model.notes) return
        const left = this.left(doc)
        const width = this.contentWidth(doc)
        const padding = 8
        doc.font('Helvetica').fontSize(9)
        const textHeight = doc.heightOfString(model.notes, { width: width - padding * 2 })
        const boxHeight = textHeight + padding * 2 + 12
        if (doc.y + boxHeight > this.pageBottom(doc) - 12) doc.addPage()

        const y = doc.y
        doc.rect(left, y, width, boxHeight).fill('#f9fafb')
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR.muted)
        doc.text('NOTES', left + padding, y + padding, { width: width - padding * 2 })
        doc.font('Helvetica').fontSize(9).fillColor(COLOR.text)
        doc.text(model.notes, left + padding, y + padding + 12, { width: width - padding * 2 })
        doc.y = y + boxHeight + 8
    }

    private drawFooters(doc: PDFKit.PDFDocument, model: InvoicePdfModel) {
        const range = doc.bufferedPageRange()
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i)
            const page = doc.page
            const left = this.left(doc)
            const width = this.contentWidth(doc)
            const savedBottom = page.margins.bottom
            // Footer sits in the reserved band; zeroing the bottom margin stops PDFKit adding a page.
            page.margins.bottom = 0

            if (model.isDraft) {
                doc.save()
                doc.rotate(-45, { origin: [page.width / 2, page.height / 2] })
                doc.font('Helvetica-Bold').fontSize(120).fillColor(COLOR.watermark).fillOpacity(0.35)
                doc.text('DRAFT', 0, page.height / 2 - 90, { width: page.width, align: 'center' })
                doc.fillOpacity(1)
                doc.restore()
            }

            const footerY = page.height - 42
            doc.font('Helvetica').fontSize(7).fillColor(COLOR.muted)
            doc.text(model.disclaimer, left, footerY, { width: width - 90, lineBreak: false })
            doc.text(`Page ${i - range.start + 1} of ${range.count}`, left + width - 90, footerY, {
                width: 90,
                align: 'right',
                lineBreak: false,
            })
            page.margins.bottom = savedBottom
        }
    }
}
