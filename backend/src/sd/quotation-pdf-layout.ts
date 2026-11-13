/**
 * Layout profile for the quotation PDF (CRM › Documents › PDF templates). It only changes how the
 * PDF looks — which header / details rows print, margins and the footer disclaimer — never the
 * quotation data. A missing or partial profile resolves to the defaults below, which reproduce the
 * original hard-coded PDF.
 */
export const QUOTATION_PDF_DISCLAIMER =
    'This is a quotation, not a sales order. Prices are valid only until the stated valid-until date.'

export const QUOTATION_PDF_MARGIN_MIN = 24
export const QUOTATION_PDF_MARGIN_MAX = 96
export const QUOTATION_PDF_DISCLAIMER_MAX = 500

/** Resolved layout the renderer draws with (every field present). */
export type QuotationPdfLayout = {
    showTin: boolean
    showOpportunity: boolean
    showPaymentTerms: boolean
    /** Points; the footer band sits below the bottom margin. */
    marginTop: number
    /** Left and right margin in points. */
    marginSide: number
    disclaimer: string
}

/** What a stored profile may carry (`sd_pdf_layout_profiles.config`); unknown keys are ignored. */
export type QuotationPdfLayoutConfig = Partial<QuotationPdfLayout>

export const DEFAULT_QUOTATION_PDF_LAYOUT: QuotationPdfLayout = {
    showTin: true,
    showOpportunity: true,
    showPaymentTerms: true,
    marginTop: 48,
    marginSide: 48,
    disclaimer: QUOTATION_PDF_DISCLAIMER,
}

const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)

const margin = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value)
        ? Math.min(QUOTATION_PDF_MARGIN_MAX, Math.max(QUOTATION_PDF_MARGIN_MIN, Math.round(value)))
        : fallback

/** Stored (possibly partial or malformed) profile config → a layout that is always safe to draw. */
export function resolveQuotationPdfLayout(config: unknown): QuotationPdfLayout {
    const source = config && typeof config === 'object' ? (config as Record<string, unknown>) : {}
    const disclaimer =
        typeof source.disclaimer === 'string' ? source.disclaimer.trim().slice(0, QUOTATION_PDF_DISCLAIMER_MAX) : ''
    const defaults = DEFAULT_QUOTATION_PDF_LAYOUT
    return {
        showTin: flag(source.showTin, defaults.showTin),
        showOpportunity: flag(source.showOpportunity, defaults.showOpportunity),
        showPaymentTerms: flag(source.showPaymentTerms, defaults.showPaymentTerms),
        marginTop: margin(source.marginTop, defaults.marginTop),
        marginSide: margin(source.marginSide, defaults.marginSide),
        disclaimer: disclaimer || defaults.disclaimer,
    }
}
