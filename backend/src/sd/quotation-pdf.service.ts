import { BadRequestException, Injectable } from '@nestjs/common'
import PDFDocumentImport from 'pdfkit'
import {
    buildQuotationPdfModel,
    formatQuotationMoney,
    type QuotationPdfInput,
    type QuotationPdfModel,
} from './quotation-pdf.model'
import { composeOverPdfDesign } from './quotation-pdf-design'
import {
    QUOTATION_PDF_PAGE,
    quotationPdfBodyInsets,
    resolveQuotationPdfLayout,
    type QuotationPdfBlocks,
    type QuotationPdfBox,
} from './quotation-pdf-layout'
import { quotationPdfLogoSize } from './quotation-pdf-logo'
/**
 * pdfkit's bundled type declarations export a document instance; at runtime the module exports the
 * `PDFDocument` constructor. This cast bridges that mismatch.
 */
const PDFDocument = PDFDocumentImport as unknown as new (
    options?: PDFKit.PDFDocumentOptions,
) => PDFKit.PDFDocument

const COLOR = {
    text: '#111827',
    muted: '#6b7280',
    line: '#d1d5db',
    band: '#f3f4f6',
    accent: '#1d4ed8',
    success: '#15803d',
    danger: '#b91c1c',
    warning: '#b45309',
    watermark: '#e5e7eb',
} as const

const STATUS_COLOR: Record<string, string> = {
    DRAFT: COLOR.muted,
    SENT: COLOR.accent,
    ACCEPTED: COLOR.success,
    REJECTED: COLOR.danger,
    EXPIRED: COLOR.warning,
    CANCELLED: COLOR.danger,
    SUPERSEDED: COLOR.muted,
    CONVERTED: COLOR.success,
}

/** Tallest the letterhead logo may print, in points (wide logos are limited by the width instead). */
const LOGO_MAX_HEIGHT = 56

/** Where a block draws: from (x, y) at `width`; `bottom` is its box's bottom edge, null in the classic flow. */
type Frame = { x: number; y: number; width: number; bottom: number | null }

/** All amounts render as ASCII-safe currency (e.g. `PHP 2,350.00`); see `formatQuotationMoney`. */
const money = formatQuotationMoney

/**
 * Renders an SD quotation to a PDF. Read-only: it never touches the quotation row or any SD state.
 * `render` returns bytes (tests, buffered responses); `createDocument` returns the stream for
 * chunked responses.
 */
@Injectable()
export class QuotationPdfService {
    /** Un-ended PDF stream for the quotation. Throws 400 when the quotation has no lines. */
    createDocument(input: QuotationPdfInput): PDFKit.PDFDocument {
        const model = buildQuotationPdfModel(input)
        if (!model.lines.length) {
            throw new BadRequestException('A quotation without lines cannot be turned into a PDF')
        }
        const body = quotationPdfBodyInsets(model.layout)
        // With boxes, the lines box sets the table's left edge and width on every page.
        const lines = model.layout.blocks?.lines
        const side = lines
            ? { left: lines.x, right: QUOTATION_PDF_PAGE.width - lines.x - lines.width }
            : { left: body.side, right: body.side }
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: body.top, bottom: body.bottom, ...side },
            bufferPages: true,
            info: {
                Title: `${model.quotation.number} rev ${model.quotation.revision}`,
                Author: model.company.name,
                Subject: `Quotation ${model.quotation.number} (${model.quotation.statusLabel})`,
            },
        })
        this.draw(doc, model)
        return doc
    }

    /**
     * Full PDF bytes, placed over the imported design when the profile has one (design under, data
     * over). The caller streams or sends them; nothing is persisted.
     */
    async render(input: QuotationPdfInput): Promise<Buffer> {
        const doc = this.createDocument(input)
        const bytes = this.toBuffer(doc)
        doc.end()
        return composeOverPdfDesign(await bytes, input.design, resolveQuotationPdfLayout(input.layout))
    }

    private toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = []
            doc.on('data', (chunk: Buffer) => chunks.push(chunk))
            doc.on('end', () => resolve(Buffer.concat(chunks)))
            doc.on('error', reject)
        })
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

    private draw(doc: PDFKit.PDFDocument, model: QuotationPdfModel) {
        if (model.layout.blocks) {
            this.drawBoxes(doc, model, model.layout.blocks)
        } else {
            this.drawHeader(doc, model)
            this.drawMeta(doc, model)
        }
        this.drawTableHeader(doc, model)
        this.drawLines(doc, model)
        this.drawTotals(doc, model)
        this.drawNotes(doc, model)
        this.drawFooters(doc, model)
    }

    /** Classic header: letterhead left, title right, then a rule. */
    private drawHeader(doc: PDFKit.PDFDocument, model: QuotationPdfModel) {
        const left = this.left(doc)
        const width = this.contentWidth(doc)
        const top = doc.y

        // An imported design usually carries the letterhead; the profile can turn the drawn one off.
        if (model.layout.showLetterhead) {
            this.drawLetterhead(doc, model, { x: left, y: top, width: width * 0.62, bottom: null }, {
                width: width * 0.5,
                height: LOGO_MAX_HEIGHT,
            })
        }
        const leftBottom = doc.y
        this.drawTitle(doc, model, { x: left, y: top, width, bottom: null })
        const rightBottom = doc.y

        doc.y = Math.max(leftBottom, rightBottom) + 10
        doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(COLOR.line).lineWidth(1).stroke()
        doc.y += 14
    }

    /** Classic customer / details columns. */
    private drawMeta(doc: PDFKit.PDFDocument, model: QuotationPdfModel) {
        const left = this.left(doc)
        const width = this.contentWidth(doc)
        const colW = width / 2 - 12
        const top = doc.y

        this.drawCustomer(doc, model, { x: left, y: top, width: colW, bottom: null })
        const leftBottom = doc.y
        this.drawDetails(doc, model, { x: left + width / 2 + 8, y: top, width: colW, bottom: null })
        const rightBottom = doc.y

        doc.y = Math.max(leftBottom, rightBottom) + 16
    }

    /**
     * Drag-and-drop layout: every block in its own page-1 box, clipped to it (text that does not fit
     * ends in an ellipsis); the lines table then starts at the lines box top.
     */
    private drawBoxes(doc: PDFKit.PDFDocument, model: QuotationPdfModel, blocks: QuotationPdfBlocks) {
        const inBox = (box: QuotationPdfBox, drawBlock: (frame: Frame) => void) => {
            doc.save()
            doc.rect(box.x, box.y, box.width, box.height).clip()
            drawBlock({ x: box.x, y: box.y, width: box.width, bottom: box.y + box.height })
            doc.restore()
        }
        if (model.layout.showLetterhead) {
            inBox(blocks.letterhead, (frame) => {
                // The logo gets the box height left over after the address and TIN lines.
                doc.font('Helvetica').fontSize(9)
                const reserved = this.letterheadLines(model).reduce(
                    (sum, line) => sum + doc.heightOfString(line, { width: frame.width }),
                    0,
                )
                const logoHeight = Math.max(12, blocks.letterhead.height - reserved - 4)
                this.drawLetterhead(doc, model, frame, { width: frame.width, height: logoHeight })
            })
        }
        inBox(blocks.title, (frame) => this.drawTitle(doc, model, frame))
        inBox(blocks.customer, (frame) => this.drawCustomer(doc, model, frame))
        inBox(blocks.details, (frame) => this.drawDetails(doc, model, frame))
        doc.y = blocks.lines.y
    }

    /** Address and TIN lines printed under the logo / company name. */
    private letterheadLines(model: QuotationPdfModel) {
        const lines: string[] = []
        if (model.company.address) lines.push(model.company.address)
        if (model.layout.showTin && model.company.tin) lines.push(`TIN: ${model.company.tin}`)
        return lines
    }

    /** Logo (or the company name when there is none), then address and TIN. */
    private drawLetterhead(
        doc: PDFKit.PDFDocument,
        model: QuotationPdfModel,
        frame: Frame,
        logoMax: { width: number; height: number },
    ) {
        doc.y = frame.y
        if (!this.drawLogo(doc, model.company.logo, frame.x, frame.y, logoMax.width, logoMax.height)) {
            doc.font('Helvetica-Bold').fontSize(20).fillColor(COLOR.text)
            this.put(doc, model.company.name, frame)
        }
        doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted)
        for (const line of this.letterheadLines(model)) this.put(doc, line, frame)
    }

    private drawTitle(doc: PDFKit.PDFDocument, model: QuotationPdfModel, frame: Frame) {
        doc.y = frame.y
        doc.font('Helvetica-Bold').fontSize(22).fillColor(COLOR.text)
        this.put(doc, 'QUOTATION', frame, { align: 'right' })
        doc.font('Helvetica').fontSize(10).fillColor(COLOR.muted)
        this.put(doc, `${model.quotation.number} · Rev ${model.quotation.revision}`, frame, { align: 'right' })
        doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .fillColor(STATUS_COLOR[model.quotation.status] ?? COLOR.text)
        this.put(doc, model.quotation.statusLabel.toUpperCase(), frame, { align: 'right' })
    }

    private drawCustomer(doc: PDFKit.PDFDocument, model: QuotationPdfModel, frame: Frame) {
        doc.y = frame.y
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.muted)
        this.put(doc, 'CUSTOMER', frame)
        doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.text)
        this.put(doc, model.customer.companyName, frame)
        doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted)
        for (const line of [model.customer.contactName, model.customer.email, model.customer.phone]) {
            if (line) this.put(doc, line, frame)
        }
    }

    private drawDetails(doc: PDFKit.PDFDocument, model: QuotationPdfModel, frame: Frame) {
        doc.y = frame.y
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.muted)
        this.put(doc, 'DETAILS', frame)
        doc.font('Helvetica').fontSize(9).fillColor(COLOR.text)
        this.put(doc, `Date: ${model.quotation.date}`, frame)
        if (model.quotation.validUntil) this.put(doc, `Valid until: ${model.quotation.validUntil}`, frame)
        if (model.layout.showPaymentTerms && model.paymentTerms) {
            this.put(doc, `Payment terms: ${model.paymentTerms}`, frame)
        }
        if (model.layout.showOpportunity && model.opportunityName) {
            this.put(doc, `Opportunity: ${model.opportunityName}`, frame)
        }
    }

    /**
     * One text run at `doc.y` inside the frame. In a box (bottom set) it is cut to the room left, with
     * an ellipsis, and skipped once not even one line fits.
     */
    private put(doc: PDFKit.PDFDocument, text: string, frame: Frame, options: PDFKit.Mixins.TextOptions = {}) {
        if (frame.bottom === null) {
            doc.text(text, frame.x, doc.y, { width: frame.width, ...options })
            return
        }
        const room = frame.bottom - doc.y
        if (room < doc.currentLineHeight()) return
        doc.text(text, frame.x, doc.y, { width: frame.width, ...options, height: room, ellipsis: true })
    }

    /**
     * Company logo scaled to fit `maxWidth` × `maxHeight`, top-left aligned; leaves `doc.y` below
     * it. False (nothing drawn) when there is no logo or it cannot be read, so the company name
     * prints instead.
     */
    private drawLogo(
        doc: PDFKit.PDFDocument,
        logo: Buffer | null,
        x: number,
        y: number,
        maxWidth: number,
        maxHeight: number,
    ) {
        const size = logo ? quotationPdfLogoSize(logo) : null
        if (!logo || !size) return false
        const scale = Math.min(maxWidth / size.width, maxHeight / size.height)
        const height = size.height * scale
        try {
            doc.image(logo, x, y, { width: size.width * scale, height })
        } catch {
            return false
        }
        doc.y = y + height + 4
        return true
    }

    private columns(doc: PDFKit.PDFDocument) {
        const left = this.left(doc)
        const width = this.contentWidth(doc)
        const noW = 26
        // Wide enough for typical SKUs (e.g. TMP-CRM-ICEBOX-50) to stay on one line at 9pt.
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

    private drawTableHeader(doc: PDFKit.PDFDocument, model: QuotationPdfModel) {
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

    private drawLines(doc: PDFKit.PDFDocument, model: QuotationPdfModel) {
        const left = this.left(doc)
        const c = this.columns(doc)
        for (const line of model.lines) {
            if (line.section) this.drawSectionHeading(doc, model, line.section)
            const skuHeight = doc.font('Helvetica').fontSize(9).heightOfString(line.sku || '', {
                width: c.skuW - 4,
            })
            const descHeight = doc.font('Helvetica').fontSize(9).heightOfString(line.description || '', {
                width: c.descW - 6,
            })
            // Row must fit its tallest cell so the bottom rule never crosses wrapped text.
            const rowHeight = Math.max(18, skuHeight + 6, descHeight + 6)
            if (doc.y + rowHeight > this.pageBottom(doc) - 12) {
                doc.addPage()
                doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.muted)
                doc.text(model.company.name, left, doc.y)
                doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.text)
                doc.text(`${model.quotation.number} · Rev ${model.quotation.revision} (continued)`, left, doc.y)
                doc.y += 6
                this.drawTableHeader(doc, model)
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

    /** Unpriced heading row spanning the table; keeps at least one line below it on the page. */
    private drawSectionHeading(doc: PDFKit.PDFDocument, model: QuotationPdfModel, title: string) {
        const left = this.left(doc)
        const c = this.columns(doc)
        const height = Math.max(
            18,
            doc.font('Helvetica-Bold').fontSize(9.5).heightOfString(title, { width: c.width - 8 }) + 8,
        )
        if (doc.y + height + 18 > this.pageBottom(doc) - 12) {
            doc.addPage()
            doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.muted)
            doc.text(model.company.name, left, doc.y)
            doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.text)
            doc.text(`${model.quotation.number} · Rev ${model.quotation.revision} (continued)`, left, doc.y)
            doc.y += 6
            this.drawTableHeader(doc, model)
        }
        const y = doc.y + 2
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR.text)
        doc.text(title, left + 4, y, { width: c.width - 8 })
        doc.y = y + height - 2
        doc.moveTo(left, doc.y - 4)
            .lineTo(left + c.width, doc.y - 4)
            .strokeColor(COLOR.line)
            .lineWidth(0.5)
            .stroke()
    }

    private drawTotals(doc: PDFKit.PDFDocument, model: QuotationPdfModel) {
        const left = this.left(doc)
        const width = this.contentWidth(doc)
        const labelW = 130
        const valueW = 130
        const x = left + width - labelW - valueW
        const y = doc.y

        doc.font('Helvetica').fontSize(10).fillColor(COLOR.muted)
        doc.text('Subtotal', x, y, { width: labelW, align: 'right' })
        doc.fillColor(COLOR.text).text(money(model.totals.subtotal, model.currency), x + labelW, y, {
            width: valueW,
            align: 'right',
        })

        const totalY = y + 18
        doc.rect(x, totalY - 4, labelW + valueW, 24).fill(COLOR.band)
        doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.text)
        doc.text('Total', x, totalY, { width: labelW, align: 'right' })
        doc.text(money(model.totals.total, model.currency), x + labelW, totalY, { width: valueW, align: 'right' })

        doc.y = totalY + 32
    }

    private drawNotes(doc: PDFKit.PDFDocument, model: QuotationPdfModel) {
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

    private drawFooters(doc: PDFKit.PDFDocument, model: QuotationPdfModel) {
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