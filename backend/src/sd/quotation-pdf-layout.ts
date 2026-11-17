/**
 * Layout profile for the quotation PDF (Documents › PDF templates). It only changes how the
 * PDF looks — which header / details rows print, margins and the footer disclaimer — never the
 * quotation data. A missing or partial profile resolves to the defaults below, which reproduce the
 * original hard-coded PDF.
 */
export const QUOTATION_PDF_DISCLAIMER =
    'This is a quotation, not a sales order. Prices are valid only until the stated valid-until date.'

export const QUOTATION_PDF_MARGIN_MIN = 24
export const QUOTATION_PDF_MARGIN_MAX = 96
export const QUOTATION_PDF_DISCLAIMER_MAX = 500
/** Content start below an imported design's artwork (points from the page top). */
export const QUOTATION_PDF_CONTENT_START_MIN = 24
export const QUOTATION_PDF_CONTENT_START_MAX = 400

/** A4 in points: the page every quotation PDF is drawn on. */
export const QUOTATION_PDF_PAGE = { width: 595.28, height: 841.89 } as const
export const QUOTATION_PDF_BOX_MIN_WIDTH = 40
export const QUOTATION_PDF_BOX_MIN_HEIGHT = 16
/** The lines table's fixed columns (#, SKU, qty, unit price, amount) plus a usable description. */
export const QUOTATION_PDF_LINES_MIN_WIDTH = 460
export const QUOTATION_PDF_LINES_MIN_Y = 24
/** Room page 1 must leave under the lines top for the column labels and a first row. */
const LINES_MIN_ROOM = 100

/** A positioned box on page 1, in points from the page's top-left corner. */
export type QuotationPdfBox = { x: number; y: number; width: number; height: number }
/** Where the lines table (column labels through Total, then notes) starts; it flows down and onto later pages. */
export type QuotationPdfLinesBox = { x: number; y: number; width: number }

/**
 * Drag-and-drop layout: page-1 boxes for each block plus the lines table's start. The letterhead
 * box holds the logo (or the company name when there is none), address and TIN.
 */
export type QuotationPdfBlocks = {
    letterhead: QuotationPdfBox
    title: QuotationPdfBox
    customer: QuotationPdfBox
    details: QuotationPdfBox
    lines: QuotationPdfLinesBox
}

export const QUOTATION_PDF_BOX_KEYS = ['letterhead', 'title', 'customer', 'details'] as const
export type QuotationPdfBoxKey = (typeof QUOTATION_PDF_BOX_KEYS)[number]

const BOX_LABELS: Record<QuotationPdfBoxKey, string> = {
    letterhead: 'Logo / company',
    title: 'Title',
    customer: 'Customer',
    details: 'Details',
}

/** Starting positions matching the classic layout on A4 with 48 pt margins. */
export const DEFAULT_QUOTATION_PDF_BLOCKS: QuotationPdfBlocks = {
    letterhead: { x: 48, y: 48, width: 300, height: 72 },
    title: { x: 347, y: 48, width: 200, height: 72 },
    customer: { x: 48, y: 132, width: 240, height: 80 },
    details: { x: 307, y: 132, width: 240, height: 80 },
    lines: { x: 48, y: 228, width: 499 },
}

/** Resolved layout the renderer draws with (every field present). */
export type QuotationPdfLayout = {
    /** Company name / address / TIN block; turn off when an imported design already has it. */
    showLetterhead: boolean
    showTin: boolean
    showOpportunity: boolean
    showPaymentTerms: boolean
    /** Points; the footer band sits below the bottom margin. */
    marginTop: number
    /** Left and right margin in points. */
    marginSide: number
    /**
     * Where content starts on every page (points from the top), so lines never run under an imported
     * design's letterhead. Null = `marginTop`.
     */
    contentStartY: number | null
    disclaimer: string
    /**
     * Positioned page-1 boxes (drag-and-drop layout). Null = the classic flowing header; then the
     * side margins also position the table. With boxes, the lines box sets the table's left edge
     * and width on every page instead.
     */
    blocks: QuotationPdfBlocks | null
}

/** What a stored profile may carry (`sd_pdf_layout_profiles.config`); unknown keys are ignored. */
export type QuotationPdfLayoutConfig = Partial<QuotationPdfLayout>

export const DEFAULT_QUOTATION_PDF_LAYOUT: QuotationPdfLayout = {
    showLetterhead: true,
    showTin: true,
    showOpportunity: true,
    showPaymentTerms: true,
    marginTop: 48,
    marginSide: 48,
    contentStartY: null,
    disclaimer: QUOTATION_PDF_DISCLAIMER,
    blocks: null,
}

const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)

const clampPoints = (value: unknown, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value)
        ? Math.min(max, Math.max(min, Math.round(value)))
        : null

const margin = (value: unknown, fallback: number) =>
    clampPoints(value, QUOTATION_PDF_MARGIN_MIN, QUOTATION_PDF_MARGIN_MAX) ?? fallback

/** Band under the bottom margin that holds the disclaimer and page number. */
export const QUOTATION_PDF_FOOTER_BAND = 28

/** Page top margin the renderer uses: the design content start when set, else the top margin. */
export const quotationPdfTopMargin = (layout: QuotationPdfLayout) => layout.contentStartY ?? layout.marginTop

/**
 * Body area of every page, as points from each edge: PDFKit writes the quotation inside it, and an
 * imported design only shows outside it (letterhead, logo, brand bar, footer, frame).
 */
export const quotationPdfBodyInsets = (layout: QuotationPdfLayout) => ({
    top: quotationPdfTopMargin(layout),
    bottom: layout.marginTop + QUOTATION_PDF_FOOTER_BAND,
    side: layout.marginSide,
})

/** Stored (possibly partial or malformed) profile config → a layout that is always safe to draw. */
export function resolveQuotationPdfLayout(config: unknown): QuotationPdfLayout {
    const source = config && typeof config === 'object' ? (config as Record<string, unknown>) : {}
    const disclaimer =
        typeof source.disclaimer === 'string' ? source.disclaimer.trim().slice(0, QUOTATION_PDF_DISCLAIMER_MAX) : ''
    const defaults = DEFAULT_QUOTATION_PDF_LAYOUT
    const resolved: QuotationPdfLayout = {
        showLetterhead: flag(source.showLetterhead, defaults.showLetterhead),
        showTin: flag(source.showTin, defaults.showTin),
        showOpportunity: flag(source.showOpportunity, defaults.showOpportunity),
        showPaymentTerms: flag(source.showPaymentTerms, defaults.showPaymentTerms),
        marginTop: margin(source.marginTop, defaults.marginTop),
        marginSide: margin(source.marginSide, defaults.marginSide),
        contentStartY: clampPoints(
            source.contentStartY,
            QUOTATION_PDF_CONTENT_START_MIN,
            QUOTATION_PDF_CONTENT_START_MAX,
        ),
        disclaimer: disclaimer || defaults.disclaimer,
        blocks: null,
    }
    // Boxes are only used when the whole set is valid for this layout; otherwise the classic header prints.
    const blocks = parseBlocks(source.blocks)
    return blocks && !quotationPdfBlocksProblem(blocks, resolved) ? { ...resolved, blocks } : resolved
}

const whole = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null)

function parseBox(value: unknown): QuotationPdfBox | null {
    if (!value || typeof value !== 'object') return null
    const box = value as Record<string, unknown>
    const [x, y, width, height] = [whole(box.x), whole(box.y), whole(box.width), whole(box.height)]
    return x === null || y === null || width === null || height === null ? null : { x, y, width, height }
}

function parseBlocks(value: unknown): QuotationPdfBlocks | null {
    if (!value || typeof value !== 'object') return null
    const source = value as Record<string, unknown>
    const boxes = Object.fromEntries(QUOTATION_PDF_BOX_KEYS.map((key) => [key, parseBox(source[key])]))
    const lines = source.lines && typeof source.lines === 'object' ? (source.lines as Record<string, unknown>) : null
    const [x, y, width] = [whole(lines?.x), whole(lines?.y), whole(lines?.width)]
    if (Object.values(boxes).some((box) => !box) || x === null || y === null || width === null) return null
    return { ...(boxes as Record<QuotationPdfBoxKey, QuotationPdfBox>), lines: { x, y, width } }
}

/**
 * Why a box layout cannot be drawn with `layout` (null when it can): boxes on the page and big
 * enough, the lines table wide enough with room on page 1, and every box ending above the table.
 */
export function quotationPdfBlocksProblem(blocks: QuotationPdfBlocks, layout: QuotationPdfLayout): string | null {
    const page = QUOTATION_PDF_PAGE
    for (const key of QUOTATION_PDF_BOX_KEYS) {
        const box = blocks[key]
        const label = BOX_LABELS[key]
        if (box.width < QUOTATION_PDF_BOX_MIN_WIDTH || box.height < QUOTATION_PDF_BOX_MIN_HEIGHT) {
            return `The ${label} box must be at least ${QUOTATION_PDF_BOX_MIN_WIDTH} × ${QUOTATION_PDF_BOX_MIN_HEIGHT} pt`
        }
        if (box.x < 0 || box.y < 0 || box.x + box.width > page.width || box.y + box.height > page.height) {
            return `The ${label} box must stay on the page`
        }
        if (box.y + box.height > blocks.lines.y) {
            return `The ${label} box must end above where the lines table starts (${blocks.lines.y} pt)`
        }
    }
    const lines = blocks.lines
    if (lines.width < QUOTATION_PDF_LINES_MIN_WIDTH) {
        return `The lines table must be at least ${QUOTATION_PDF_LINES_MIN_WIDTH} pt wide`
    }
    if (lines.x < 0 || lines.x + lines.width > page.width) return 'The lines table must stay on the page'
    const maxY = Math.floor(page.height - quotationPdfBodyInsets(layout).bottom - LINES_MIN_ROOM)
    if (lines.y < QUOTATION_PDF_LINES_MIN_Y || lines.y > maxY) {
        return `The lines table must start between ${QUOTATION_PDF_LINES_MIN_Y} and ${maxY} pt from the top`
    }
    return null
}
