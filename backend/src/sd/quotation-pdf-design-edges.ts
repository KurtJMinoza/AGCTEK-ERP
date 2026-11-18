import {
    decodePDFRawStream,
    PDFArray,
    PDFContext,
    PDFDict,
    PDFDocument,
    PDFName,
    PDFNumber,
    PDFObject,
    PDFRawStream,
    PDFRef,
    PDFStream,
} from 'pdf-lib'
import { quotationPdfBodyInsets, type QuotationPdfLayout } from './quotation-pdf-layout'

/**
 * Keeps only the edge artwork of an imported design: letterhead, logo, brand bar, footer, frame or
 * background shapes. The body band is the page height between the header zone (above the content
 * start) and the footer zone (bottom margin + footer band). The design's drawing instructions are
 * read once per render and:
 * - shapes and images that reach the header or footer zone are kept whole (never cut), so frames,
 *   corner art and full-height side bars stay intact,
 * - shapes and images drawn entirely within the body band (sample tables, lines, boxes) are not painted,
 * - text is shown only when it starts in the header or footer zone.
 * Side margins play no part: template content often starts closer to the edge than the quotation does.
 * Everything else in the stream (graphics state, clipping, marked content) is left byte-for-byte.
 */

type Matrix = [number, number, number, number, number, number]
/** Body band in the design's user space (y grows upwards). */
type Band = { y0: number; y1: number }

type Operation = {
    op: string
    /** First operand (or the operator when it has none). */
    start: number
    /** Operator token start. */
    opStart: number
    end: number
    nums: number[]
    name?: { text: string; start: number; end: number }
}

type Edit = { start: number; end: number; text: string }

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
const TOLERANCE = 0.5
const MAX_FORM_DEPTH = 12
const PAINT_OPS = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*'])
const SHOW_OPS = new Set(['Tj', 'TJ', "'", '"'])
const WHITESPACE = new Set([0, 9, 10, 12, 13, 32])
const DELIMITERS = '()<>[]{}/%'
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/

const multiply = (m: Matrix, n: Matrix): Matrix => [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
]

const apply = (m: Matrix, x: number, y: number): [number, number] => [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
]

const asMatrix = (nums: number[]): Matrix | null =>
    nums.length >= 6 ? (nums.slice(-6) as Matrix) : null

/** Splits a content stream into operations, keeping byte offsets so edits can be spliced in. */
export function parseContentOperations(src: string): Operation[] {
    const ops: Operation[] = []
    const n = src.length
    let i = 0
    let depth = 0
    let operandStart: number | null = null
    let nums: number[] = []
    let name: Operation['name']

    const isRegular = (k: number) => !WHITESPACE.has(src.charCodeAt(k)) && !DELIMITERS.includes(src[k])
    const operand = (start: number) => {
        if (operandStart === null) operandStart = start
    }

    while (i < n) {
        const ch = src[i]
        if (WHITESPACE.has(src.charCodeAt(i))) {
            i++
            continue
        }
        if (ch === '%') {
            while (i < n && src[i] !== '\n' && src[i] !== '\r') i++
            continue
        }
        const start = i
        if (ch === '(') {
            let nesting = 0
            for (; i < n; i++) {
                if (src[i] === '\\') {
                    i++
                    continue
                }
                if (src[i] === '(') nesting++
                else if (src[i] === ')' && --nesting === 0) {
                    i++
                    break
                }
            }
            operand(start)
            continue
        }
        if ((ch === '<' && src[i + 1] === '<') || ch === '[' || ch === '{') {
            i += ch === '<' ? 2 : 1
            depth++
            operand(start)
            continue
        }
        if ((ch === '>' && src[i + 1] === '>') || ch === ']' || ch === '}') {
            i += ch === '>' ? 2 : 1
            depth = Math.max(0, depth - 1)
            continue
        }
        if (ch === '<') {
            const close = src.indexOf('>', i)
            i = close < 0 ? n : close + 1
            operand(start)
            continue
        }
        if (ch === '/') {
            i++
            while (i < n && isRegular(i)) i++
            operand(start)
            if (depth === 0) name = { text: src.slice(start + 1, i), start, end: i }
            continue
        }
        while (i < n && isRegular(i)) i++
        if (i === start) {
            i++
            continue
        }
        const token = src.slice(start, i)
        if (NUMBER.test(token)) {
            operand(start)
            if (depth === 0) nums.push(Number(token))
            continue
        }
        if (depth > 0 || token === 'true' || token === 'false' || token === 'null') {
            operand(start)
            continue
        }
        let end = i
        if (token === 'BI') {
            const id = /(^|[\s])ID[\s]/.exec(src.slice(i))
            const dataStart = id ? i + id.index + id[0].length : n
            const ei = /[\s]EI(?=[\s]|$)/.exec(src.slice(dataStart))
            end = ei ? dataStart + ei.index + ei[0].length : n
            i = end
        }
        ops.push({ op: token, start: operandStart ?? start, opStart: start, end, nums, name })
        operandStart = null
        nums = []
        name = undefined
    }
    return ops
}

function streamText(object: PDFObject | undefined): string {
    if (object instanceof PDFRawStream) return Buffer.from(decodePDFRawStream(object).decode()).toString('latin1')
    if (object instanceof PDFStream) return Buffer.from(object.getContents()).toString('latin1')
    return ''
}

class EdgeCapture {
    private formCount = 0

    constructor(
        private readonly context: PDFContext,
        private readonly body: Band,
    ) {}

    private inside(points: [number, number][]): boolean {
        const { y0, y1 } = this.body
        return points.length > 0 && points.every(([, y]) => y >= y0 - TOLERANCE && y <= y1 + TOLERANCE)
    }

    private unitSquare(ctm: Matrix) {
        return [apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 0, 1), apply(ctm, 1, 1)]
    }

    /** Filtered content for one stream drawn with `ctm`; resources resolve XObjects for `Do`. */
    run(src: string, initialCtm: Matrix, resources: PDFDict | undefined, depth: number): string {
        const edits: Edit[] = []
        const stack: Matrix[] = []
        let ctm = initialCtm
        let path: [number, number][] = []
        let tlm: Matrix = IDENTITY
        let tm: Matrix = IDENTITY
        let leading = 0
        const xobjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict)

        const nextLine = () => {
            tlm = multiply([1, 0, 0, 1, 0, -leading], tlm)
            tm = tlm
        }
        const textInside = () => this.inside([apply(multiply(tm, ctm), 0, 0)])

        for (const operation of parseContentOperations(src)) {
            const { op, nums } = operation
            switch (op) {
                case 'q':
                    stack.push(ctm)
                    break
                case 'Q':
                    ctm = stack.pop() ?? initialCtm
                    break
                case 'cm': {
                    const m = asMatrix(nums)
                    if (m) ctm = multiply(m, ctm)
                    break
                }
                case 'm':
                case 'l':
                    if (nums.length >= 2) path.push(apply(ctm, nums[nums.length - 2], nums[nums.length - 1]))
                    break
                case 'c':
                case 'v':
                case 'y':
                    for (let k = 0; k + 1 < nums.length; k += 2) path.push(apply(ctm, nums[k], nums[k + 1]))
                    break
                case 're':
                    if (nums.length >= 4) {
                        const [x, y, w, h] = nums.slice(-4)
                        path.push(apply(ctm, x, y), apply(ctm, x + w, y), apply(ctm, x, y + h), apply(ctm, x + w, y + h))
                    }
                    break
                case 'n':
                    path = []
                    break
                case 'BT':
                    tlm = IDENTITY
                    tm = IDENTITY
                    break
                case 'Tm': {
                    const m = asMatrix(nums)
                    if (m) {
                        tlm = m
                        tm = m
                    }
                    break
                }
                case 'Td':
                case 'TD':
                    if (nums.length >= 2) {
                        const [tx, ty] = nums.slice(-2)
                        if (op === 'TD') leading = -ty
                        tlm = multiply([1, 0, 0, 1, tx, ty], tlm)
                        tm = tlm
                    }
                    break
                case 'TL':
                    if (nums.length) leading = nums[nums.length - 1]
                    break
                case 'T*':
                    nextLine()
                    break
                case 'Do':
                    this.paintXObject(operation, ctm, xobjects, resources, depth, edits)
                    break
                case 'BI':
                    if (this.inside(this.unitSquare(ctm))) edits.push({ start: operation.start, end: operation.end, text: ' ' })
                    break
                default:
                    if (PAINT_OPS.has(op)) {
                        if (this.inside(path)) edits.push({ start: operation.opStart, end: operation.end, text: 'n' })
                        path = []
                    } else if (SHOW_OPS.has(op)) {
                        if (op === "'" || op === '"') nextLine()
                        if (textInside()) {
                            // ' and " also move to the next line; keep that so later kept text stays put.
                            const text =
                                op === "'"
                                    ? ' T* '
                                    : op === '"' && nums.length >= 2
                                      ? ` ${nums[0]} Tw ${nums[1]} Tc T* `
                                      : ' '
                            edits.push({ start: operation.start, end: operation.end, text })
                        }
                    }
            }
        }

        if (!edits.length) return src
        let out = ''
        let cursor = 0
        for (const edit of edits.sort((a, b) => a.start - b.start)) {
            out += src.slice(cursor, edit.start) + edit.text
            cursor = edit.end
        }
        return out + src.slice(cursor)
    }

    private paintXObject(
        operation: Operation,
        ctm: Matrix,
        xobjects: PDFDict | undefined,
        resources: PDFDict | undefined,
        depth: number,
        edits: Edit[],
    ) {
        const name = operation.name
        if (!name || !xobjects) return
        const ref = xobjects.get(PDFName.of(name.text))
        const xobject = this.context.lookup(ref)
        if (!(xobject instanceof PDFStream)) return
        const subtype = xobject.dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString()

        if (subtype === '/Image') {
            if (this.inside(this.unitSquare(ctm))) edits.push({ start: operation.start, end: operation.end, text: ' ' })
            return
        }
        if (subtype !== '/Form' || depth >= MAX_FORM_DEPTH) return

        const matrixArray = xobject.dict.lookupMaybe(PDFName.of('Matrix'), PDFArray)
        const formMatrix = matrixArray
            ? (matrixArray.asArray().map((value) => (value instanceof PDFNumber ? value.asNumber() : 0)) as Matrix)
            : IDENTITY
        const formResources = xobject.dict.lookupMaybe(PDFName.of('Resources'), PDFDict) ?? resources
        const src = streamText(xobject)
        const filtered = this.run(src, multiply(formMatrix, ctm), formResources, depth + 1)
        if (filtered === src) return

        // A filtered copy under a new name: the original form may be drawn elsewhere at another position.
        const copy = this.context.flateStream(Buffer.from(filtered, 'latin1'))
        for (const [key, value] of xobject.dict.entries()) {
            const k = key.asString()
            if (k !== '/Filter' && k !== '/DecodeParms' && k !== '/Length') copy.dict.set(key, value)
        }
        const copyName = `${name.text}Edge${++this.formCount}`
        xobjects.set(PDFName.of(copyName), this.context.register(copy) as PDFRef)
        edits.push({ start: name.start, end: name.end, text: `/${copyName}` })
    }
}

/**
 * One-page PDF with only the design's edge artwork (see file comment), ready to place under a
 * quotation page of `pageSize`. The body band matches the area PDFKit writes the quotation into.
 */
export async function captureQuotationPdfDesignEdges(
    design: Buffer,
    layout: QuotationPdfLayout,
    pageSize: { width: number; height: number },
): Promise<Buffer> {
    const doc = await PDFDocument.load(design)
    while (doc.getPageCount() > 1) doc.removePage(doc.getPageCount() - 1)
    const page = doc.getPage(0)
    const media = page.getMediaBox()
    const sy = media.height / pageSize.height
    const insets = quotationPdfBodyInsets(layout)
    const body: Band = {
        y0: media.y + insets.bottom * sy,
        y1: media.y + media.height - insets.top * sy,
    }

    const contents = page.node.Contents()
    const parts = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
    const src = parts.map((part) => streamText(doc.context.lookup(part))).join('\n')
    const filtered = new EdgeCapture(doc.context, body).run(src, IDENTITY, page.node.Resources(), 0)
    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream(Buffer.from(filtered, 'latin1'))))
    return Buffer.from(await doc.save())
}
