import {
    decodePDFRawStream,
    fill,
    PDFArray,
    PDFDict,
    PDFDocument,
    PDFName,
    PDFRawStream,
    rectangle,
    StandardFonts,
} from 'pdf-lib'
import { captureQuotationPdfDesignEdges, parseContentOperations } from './quotation-pdf-design-edges'
import { resolveQuotationPdfLayout } from './quotation-pdf-layout'

const A4 = { width: 595.28, height: 841.89 }
// Defaults: content starts 48 pt from the top, footer zone is the bottom 76 pt (48 + 28 band).
const layout = resolveQuotationPdfLayout(null)
const hex = (text: string) => Buffer.from(text, 'latin1').toString('hex').toUpperCase()

const decode = (stream: unknown) => Buffer.from(decodePDFRawStream(stream as PDFRawStream).decode()).toString('latin1')

async function pageContent(pdf: Buffer) {
    const doc = await PDFDocument.load(pdf)
    const contents = doc.getPage(0).node.Contents()
    const parts = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
    return parts.map((part) => decode(doc.context.lookup(part))).join('\n')
}

/** Paint operator that follows each `re` (n = not painted). */
const paintsAfterRects = (content: string) => {
    const ops = parseContentOperations(content).map((op) => op.op)
    return ops.flatMap((op, i) => (op === 're' ? [ops.slice(i + 1).find((next) => next !== 're') ?? ''] : []))
}

/** Background, a sample box and text in the body, a header line, a footer bar. */
async function drawSampleDesign(doc: PDFDocument) {
    const page = doc.addPage([A4.width, A4.height])
    const font = await doc.embedFont(StandardFonts.Helvetica)
    page.pushOperators(rectangle(0, 0, A4.width, A4.height), fill()) // full-page background
    page.pushOperators(rectangle(100, 400, 50, 20), fill()) // sample table cell in the body
    page.pushOperators(rectangle(0, 0, A4.width, 20), fill()) // footer brand bar
    page.drawText('Letterhead', { x: 60, y: 815, size: 12, font })
    page.drawText('Sample', { x: 100, y: 400, size: 12, font })
    page.drawText('Edge', { x: 10, y: 400, size: 12, font }) // body band near the side: still sample
    return page
}

describe('parseContentOperations', () => {
    it('keeps strings, arrays, dicts and inline images inside their operation', () => {
        const src = '/P <</MCID 3>> BDC (a \\) (nested) b) Tj [(x) -20 (y)] TJ BI /W 1 /H 1 ID \x00EI\x01 EI 1 0 0 1 5 6 cm EMC'
        const ops = parseContentOperations(src)
        expect(ops.map((op) => op.op)).toEqual(['BDC', 'Tj', 'TJ', 'BI', 'cm', 'EMC'])
        expect(ops[4].nums).toEqual([1, 0, 0, 1, 5, 6])
        expect(src.slice(ops[1].start, ops[1].end)).toBe('(a \\) (nested) b) Tj')
        expect(src.slice(ops[3].start, ops[3].end)).toBe('BI /W 1 /H 1 ID \x00EI\x01 EI')
    })
})

describe('captureQuotationPdfDesignEdges', () => {
    it('keeps artwork reaching the header / footer zones whole and drops body-only shapes and text', async () => {
        const doc = await PDFDocument.create()
        await drawSampleDesign(doc)
        const content = await pageContent(
            await captureQuotationPdfDesignEdges(Buffer.from(await doc.save()), layout, A4),
        )

        expect(paintsAfterRects(content)).toEqual(['f', 'n', 'f'])
        expect(content).toContain(hex('Letterhead'))
        expect(content).not.toContain(hex('Sample'))
        expect(content).not.toContain(hex('Edge'))
        expect(content.match(/\bTj\b/g)).toHaveLength(1)
    })

    it('moves the body band with the content start: header text below it is dropped', async () => {
        const doc = await PDFDocument.create()
        await drawSampleDesign(doc)
        const deeper = resolveQuotationPdfLayout({ contentStartY: 20 })
        const content = await pageContent(
            await captureQuotationPdfDesignEdges(Buffer.from(await doc.save()), deeper, A4),
        )
        expect(content).not.toContain(hex('Letterhead'))
    })

    it('filters artwork nested in form XObjects (how Canva exports) into a renamed copy', async () => {
        const inner = await PDFDocument.create()
        await drawSampleDesign(inner)
        const outer = await PDFDocument.create()
        const [embedded] = await outer.embedPdf(Buffer.from(await inner.save()), [0])
        outer.addPage([A4.width, A4.height]).drawPage(embedded, { x: 0, y: 0, ...A4 })

        const captured = await PDFDocument.load(
            await captureQuotationPdfDesignEdges(Buffer.from(await outer.save()), layout, A4),
        )
        const page = captured.getPage(0)
        const xobjects = page.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict)
        const copy = xobjects.keys().find((key) => key.asString().includes('Edge'))
        expect(copy).toBeDefined()
        expect(await pageContent(Buffer.from(await captured.save()))).toContain(`${copy!.asString()} Do`)

        const formContent = decode(captured.context.lookup(xobjects.get(copy!)))
        expect(paintsAfterRects(formContent)).toEqual(['f', 'n', 'f'])
        expect(formContent).not.toContain(hex('Sample'))
    })

    it('rejects unreadable input so uploads can refuse it', async () => {
        await expect(captureQuotationPdfDesignEdges(Buffer.from('%PDF-1.7 broken'), layout, A4)).rejects.toThrow()
    })
})
