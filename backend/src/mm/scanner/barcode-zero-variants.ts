/**
 * Leading-zero tolerance for retail barcodes (UPC-A / EAN-13 / GTIN-14).
 *
 * Spreadsheets and legacy systems store barcodes as numbers and silently drop
 * leading zeros (UPC `062600061546` becomes `62600061546`), while a scanner
 * always reads the full code. The same product can therefore be stored as 11,
 * 12, 13 or 14 digits. Matching stays exact first; only on a miss are the
 * zero-padded / zero-stripped forms tried.
 *
 * Only digit-only codes with at least `MIN_SIGNIFICANT_DIGITS` significant
 * digits are normalized, so short internal codes (`0012`, `000123`) never
 * collide with each other.
 */
export const MIN_SIGNIFICANT_DIGITS = 8
const GTIN_WIDTHS = [12, 13, 14] as const

/** Other leading-zero forms of `raw`, never including `raw` itself. */
export function barcodeZeroVariants(raw: string): string[] {
    const value = raw.trim()
    if (!/^\d+$/.test(value) || value.length > 14) return []
    const core = value.replace(/^0+/, '')
    if (core.length < MIN_SIGNIFICANT_DIGITS) return []
    const forms = new Set<string>([core])
    for (const width of GTIN_WIDTHS) {
        if (width >= core.length) forms.add(core.padStart(width, '0'))
    }
    forms.delete(value)
    return [...forms]
}

/**
 * Runs `find` with the exact barcode, then (only when nothing matched) with
 * its other leading-zero forms. Exact matches always win.
 */
export async function findWithZeroTolerance<T>(
    raw: string,
    find: (barcode: string | { in: string[] }) => Promise<T | null>,
): Promise<T | null> {
    const value = raw.trim()
    const exact = await find(value)
    if (exact) return exact
    const variants = barcodeZeroVariants(value)
    return variants.length ? find({ in: variants }) : null
}
