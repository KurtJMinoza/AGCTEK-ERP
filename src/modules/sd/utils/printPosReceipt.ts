/**
 * POS sales receipt printing (A4 sheet, two copies per page).
 *
 * Prints an existing receipt DOM only — never creates or posts a sale.
 * Uses an off-screen iframe so dialog chrome is not sent to the printer.
 */

export type PrintPosReceiptResult = {
    ok: boolean
    /** Print dialog closed without entering print layout (likely cancelled). */
    cancelled?: boolean
    message: string
}

const AFTER_PRINT_FALLBACK_MS = 45_000

function copyStylesInto(target: Document) {
    document
        .querySelectorAll('style, link[rel="stylesheet"]')
        .forEach((node) => {
            target.head.appendChild(node.cloneNode(true))
        })
}

function waitFrames(count = 2): Promise<void> {
    return new Promise((resolve) => {
        const step = (left: number) => {
            if (left <= 0) {
                resolve()
                return
            }
            requestAnimationFrame(() => step(left - 1))
        }
        step(count)
    })
}

/**
 * Resolves once every image of the receipt (company logo) has loaded or failed,
 * so a slow logo is not printed as a blank gap. Bounded so a dead URL never
 * blocks the print.
 */
function waitForImages(root: HTMLElement, timeoutMs = 3000): Promise<void> {
    const pending = Array.from(root.querySelectorAll('img'))
        .filter((img) => !img.complete)
        .map(
            (img) =>
                new Promise<void>((resolve) => {
                    img.addEventListener('load', () => resolve(), {
                        once: true,
                    })
                    img.addEventListener('error', () => resolve(), {
                        once: true,
                    })
                }),
        )
    if (!pending.length) return Promise.resolve()
    return Promise.race([
        Promise.all(pending).then(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
    ])
}

const PX_PER_MM = 96 / 25.4
/** Printable width of an A4 sheet with 10 mm margins. */
const CONTENT_WIDTH_MM = 190
/** Printable height of an A4 sheet with 10 mm margins. */
const PAGE_HEIGHT_MM = 277
/** Height of each half: (277 mm printable - 9 mm cut line) / 2. */
const HALF_HEIGHT_MM = 134
const CUT_HEIGHT_MM = 9
/** Size of a short sale relative to the form (1 = the full 190 mm wide layout). */
const BASE_SCALE = 0.88
/** Floor so a very long sale stays printable; never page-breaks to a second sheet. */
const MIN_FIT_SCALE = 0.4

/**
 * Lays the receipt copies of `POSReceiptSheet` out on **one** A4 page.
 *
 * Each copy is shrunk (never enlarged) to fit its half of the sheet; the copy
 * is laid out wider by the same factor, so the shrunken receipt still spans
 * the page width. Long sales shrink further instead of spilling onto another
 * page — both copies and the cut line always stay on the same sheet.
 */
export function layoutReceiptCopies(root: HTMLElement) {
    const copies = Array.from(
        root.querySelectorAll<HTMLElement>('[data-receipt-copy]'),
    )
    const cut = root.querySelector<HTMLElement>('[data-receipt-cut]')
    if (copies.length < 2) return

    const inners = copies.map(
        (copy) =>
            copy.querySelector<HTMLElement>('[data-receipt-copy-inner]') ??
            copy,
    )
    const naturalHeight = Math.max(
        ...inners.map((inner) => inner.offsetHeight),
        1,
    )
    const fit = Math.min(1, (HALF_HEIGHT_MM * PX_PER_MM) / naturalHeight)
    // Short sales print a little smaller than the page allows; long sales shrink
    // further so both copies still share one sheet.
    const scale = Math.max(MIN_FIT_SCALE, Math.min(BASE_SCALE, fit))

    root.style.maxHeight = `${PAGE_HEIGHT_MM}mm`
    root.style.overflow = 'hidden'
    root.style.breakInside = 'avoid'
    root.style.pageBreakInside = 'avoid'
    root.style.breakAfter = 'avoid'
    root.style.pageBreakAfter = 'avoid'

    copies.forEach((copy) => {
        copy.style.height = `${HALF_HEIGHT_MM}mm`
        copy.style.maxHeight = `${HALF_HEIGHT_MM}mm`
        copy.style.overflow = 'hidden'
        copy.style.breakInside = 'avoid'
        copy.style.pageBreakInside = 'avoid'
        copy.style.breakAfter = 'avoid'
        copy.style.pageBreakAfter = 'avoid'
    })
    inners.forEach((inner) => {
        inner.style.width = `${CONTENT_WIDTH_MM / scale}mm`
        inner.style.maxWidth = 'none'
        inner.style.setProperty('zoom', String(scale))
    })
    if (cut) {
        cut.style.height = `${CUT_HEIGHT_MM}mm`
        cut.style.padding = '0'
        cut.style.display = ''
        cut.style.breakInside = 'avoid'
        cut.style.pageBreakInside = 'avoid'
    }
}

/** Null / SSR guards — used by the POS Print / Reprint buttons. */
export function printPosReceiptUnavailableReason(
    source: HTMLElement | null,
): string | null {
    if (typeof window === 'undefined') {
        return 'Printing is only available in the browser.'
    }
    if (!source) {
        return 'Receipt is not ready to print. Close and open it again.'
    }
    return null
}

/**
 * Send the mounted `.print-isolate` (or any receipt node) to the printer.
 * Resolves when the browser print dialog finishes or times out.
 */
export async function printPosReceipt(
    source: HTMLElement | null,
): Promise<PrintPosReceiptResult> {
    const unavailable = printPosReceiptUnavailableReason(source)
    if (unavailable) return { ok: false, message: unavailable }

    const iframe = document.createElement('iframe')
    iframe.setAttribute('title', 'POS receipt print')
    iframe.setAttribute('aria-hidden', 'true')
    // Non-zero size: some Windows printer drivers skip empty frames.
    iframe.style.cssText =
        'position:fixed;right:0;bottom:0;width:210mm;height:100vh;border:0;opacity:0;pointer-events:none;z-index:-1'
    document.body.appendChild(iframe)

    const win = iframe.contentWindow
    const doc = iframe.contentDocument
    if (!win || !doc) {
        iframe.remove()
        return { ok: false, message: 'Unable to open the print frame.' }
    }

    const clone = source!.cloneNode(true) as HTMLElement
    clone.classList.remove('hidden')
    clone.style.display = 'block'
    clone.style.visibility = 'visible'
    clone.style.width = '190mm'
    clone.style.maxWidth = '100%'
    clone.style.margin = '0 auto'
    clone.style.background = '#fff'
    clone.style.color = '#000'

    doc.open()
    doc.write(
        '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Receipt</title></head><body></body></html>',
    )
    doc.close()
    copyStylesInto(doc)

    const pageStyle = doc.createElement('style')
    pageStyle.textContent = `
      @page { size: A4 portrait; margin: 10mm; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        color: #000 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      [data-receipt-sheet] {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        max-height: 277mm;
        overflow: hidden;
      }
      [data-receipt-copy], [data-receipt-cut] {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        break-after: avoid !important;
        page-break-after: avoid !important;
      }
    `
    doc.head.appendChild(pageStyle)
    doc.body.appendChild(clone)

    await waitForImages(clone)
    await waitFrames(2)
    layoutReceiptCopies(clone)
    await waitFrames(1)

    return new Promise((resolve) => {
        let settled = false
        let enteredPrint = false

        const finish = (result: PrintPosReceiptResult) => {
            if (settled) return
            settled = true
            win.removeEventListener('afterprint', onAfterPrint)
            try {
                mql.removeEventListener('change', onPrintMedia)
            } catch {
                /* ignore */
            }
            window.clearTimeout(fallbackTimer)
            iframe.remove()
            resolve(result)
        }

        const onAfterPrint = () => {
            if (enteredPrint) {
                finish({
                    ok: true,
                    message:
                        'Print job sent. If nothing printed, check the paper and printer connection and tap Reprint.',
                })
                return
            }
            // matchMedia('print') is unreliable inside some iframe engines —
            // treat afterprint as a completed attempt and keep the sale untouched.
            finish({
                ok: true,
                cancelled: true,
                message:
                    'Print dialog closed. Tap Reprint if nothing printed — the sale was not changed.',
            })
        }

        const onPrintMedia = (event: MediaQueryListEvent) => {
            if (event.matches) enteredPrint = true
        }

        const mql = win.matchMedia('print')
        mql.addEventListener('change', onPrintMedia)
        win.addEventListener('afterprint', onAfterPrint)

        const fallbackTimer = window.setTimeout(() => {
            finish({
                ok: false,
                message:
                    'Print timed out. Check the printer connection and tap Reprint — the sale was not changed.',
            })
        }, AFTER_PRINT_FALLBACK_MS)

        try {
            win.focus()
            win.print()
        } catch (error) {
            finish({
                ok: false,
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unable to reach the printer.',
            })
        }
    })
}
