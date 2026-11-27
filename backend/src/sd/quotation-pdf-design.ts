import { BadRequestException, Logger, PayloadTooLargeException } from '@nestjs/common'
import { PDFDocument } from 'pdf-lib'
import { createDocumentStorage } from '../common/document-storage'
import { captureQuotationPdfDesignEdges } from './quotation-pdf-design-edges'
import { DEFAULT_QUOTATION_PDF_LAYOUT, QUOTATION_PDF_PAGE as A4, type QuotationPdfLayout } from './quotation-pdf-layout'

/**
 * Imported PDF design for quotation PDFs (Documents › PDF templates): one static page whose edge
 * zones (letterhead, logo, brand bar, footer, frame) are placed on every page. PDFKit draws every
 * commercial value on top; nothing printed in the design is ever read as data.
 */
export const QUOTATION_PDF_DESIGN_MAX_BYTES = 5 * 1024 * 1024

const storage = createDocumentStorage('sd', 'pdf-designs')
const log = new Logger('QuotationPdfDesign')

/** Validates an uploaded design: a real, unencrypted, single-page PDF within the size limit. */
export async function assertQuotationPdfDesign(bytes: Buffer): Promise<void> {
    if (bytes.length === 0) throw new BadRequestException('The design file is empty')
    if (bytes.length > QUOTATION_PDF_DESIGN_MAX_BYTES) {
        throw new PayloadTooLargeException('PDF designs are limited to 5 MB')
    }
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
        throw new BadRequestException('The design must be a PDF file')
    }
    let pageCount: number
    try {
        pageCount = (await PDFDocument.load(bytes)).getPageCount()
    } catch (error) {
        const encrypted = error instanceof Error && /encrypt/i.test(error.message)
        throw new BadRequestException(
            encrypted ? 'Encrypted PDFs cannot be used as a design' : 'The PDF could not be read; export it again',
        )
    }
    if (pageCount !== 1) {
        throw new BadRequestException(`The design must be a single page (this PDF has ${pageCount})`)
    }
    try {
        await captureQuotationPdfDesignEdges(bytes, DEFAULT_QUOTATION_PDF_LAYOUT, A4)
    } catch {
        throw new BadRequestException("The design's artwork could not be read; export it again as a standard PDF")
    }
}

export function saveQuotationPdfDesign(profileKey: string, fileName: string, bytes: Buffer): string {
    const storageKey = storage.buildKey('profile', profileKey, fileName)
    storage.save(storageKey, bytes)
    return storageKey
}

export function readQuotationPdfDesign(storageKey: string | null | undefined): Buffer | null {
    return storageKey ? storage.readBuffer(storageKey) : null
}

export function deleteQuotationPdfDesign(storageKey: string | null | undefined): void {
    storage.remove(storageKey)
}

/**
 * Design under, data over: only the design's edge artwork (`captureQuotationPdfDesignEdges`) is
 * scaled to each quotation page and drawn under it, so letterhead, logo, brand bar, footer, frame
 * and background shapes show whole, while sample text and tables in the body are left out. Fails
 * soft: a design that cannot be read returns the plain quotation.
 */
export async function composeOverPdfDesign(
    quotation: Buffer,
    design: Buffer | null | undefined,
    layout: QuotationPdfLayout,
): Promise<Buffer> {
    if (!design) return quotation
    try {
        const output = await PDFDocument.create()
        const source = await PDFDocument.load(quotation)
        const pages = await output.embedPdf(quotation, source.getPageIndices())
        const edges = await captureQuotationPdfDesignEdges(design, layout, pages[0] ?? A4)
        const [background] = await output.embedPdf(edges, [0])
        for (const page of pages) {
            const { width, height } = page
            const target = output.addPage([width, height])
            target.drawPage(background, { x: 0, y: 0, width, height })
            target.drawPage(page, { x: 0, y: 0, width, height })
        }
        output.setTitle(source.getTitle() ?? 'Quotation')
        output.setAuthor(source.getAuthor() ?? '')
        output.setSubject(source.getSubject() ?? '')
        return Buffer.from(await output.save())
    } catch (error) {
        log.warn(
            `PDF design could not be applied; rendering the plain quotation (${error instanceof Error ? error.message : String(error)})`,
        )
        return quotation
    }
}
