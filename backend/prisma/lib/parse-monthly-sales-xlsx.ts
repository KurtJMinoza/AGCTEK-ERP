import * as XLSX from 'xlsx'
import {
    alignDateToSheetMonth,
    parseDateCell,
    sheetMonthAndYear,
} from './xlsx-sheet-date'

export type ParsedSalesLine = {
    sheetName: string
    saleDate: Date
    dateFixed: boolean
    serviceReceipt: string | null
    customerName: string
    location: string
    barcode: string | null
    accountTitle: string | null
    particular: string
    qty: number
    uom: string | null
    cost: number
    srp: number
    sales: number
    discount: number
    totalSales: number
    salesType: string | null
    invoiceType: string | null
    invoiceNumber: string | null
    remarks: string | null
    /** POS store counter vs online / marketplace. */
    channel: 'POS' | 'ECOMMERCE'
    /** CASH | CHARGE | CREDIT | … normalized. */
    paymentKind: 'CASH' | 'CHARGE' | 'OTHER'
}

const SHEET_SKIP = new Set([
    'TOTAL',
    'Sheet2',
    'Sheet3',
    'ITEMS',
    'DISCOUNT RULES',
])

function cellText(value: unknown): string {
    if (value == null) return ''
    return String(value).replace(/\r\n/g, '\n').trim()
}

function cellAmount(value: unknown): number {
    if (value == null || value === '') return 0
    if (typeof value === 'number' && Number.isFinite(value)) return value
    const text = String(value).replace(/[^\d.-]/g, '')
    const n = parseFloat(text)
    return Number.isFinite(n) ? n : 0
}

function normalizeHeader(value: unknown): string {
    return cellText(value)
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .replace(/[^A-Z0-9 +()/]/g, '')
}

type ColMap = {
    date: number
    receipt: number
    customer: number
    location: number
    barcode: number
    accountTitle: number
    particular: number
    qty: number
    uom: number
    cost: number
    srp: number
    sales: number
    discount: number
    subtotal: number
    totalSales: number
    salesType: number
    invoiceType: number
    invoiceNumber: number
    remarks: number
}

function findHeader(rows: unknown[][]): { index: number; cols: ColMap } | null {
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
        const row = rows[i] ?? []
        const labels = row.map(normalizeHeader)
        const dateIdx = labels.findIndex((h) => h === 'DATE')
        const particularIdx = labels.findIndex((h) => h.includes('PARTICULAR'))
        if (dateIdx < 0 || particularIdx < 0) continue

        const find = (...needles: string[]) => {
            for (const needle of needles) {
                const idx = labels.findIndex(
                    (h) => h === needle || h.includes(needle),
                )
                if (idx >= 0) return idx
            }
            return -1
        }

        return {
            index: i,
            cols: {
                date: dateIdx,
                receipt: find('SERVICE RECEIPT', 'SERVICE'),
                customer: find('CUSTOMER NAME', 'CUSTOMER'),
                location: find('LOCATION'),
                barcode: find('BARCODE'),
                accountTitle: find('ACCOUNT TITLE'),
                particular: particularIdx,
                qty: find('QTY'),
                uom: find('UOM'),
                cost: find('COST'),
                srp: find('SRP'),
                sales: find('SALES'),
                discount: find('DISCOUNT'),
                subtotal: find('SUBTOTAL'),
                totalSales: find('TOTAL SALES'),
                salesType: find('SALES TYPE'),
                invoiceType: find('INVOICE TYPE'),
                invoiceNumber: find('INVOICE NUMBER'),
                remarks: find('REMARKS'),
            },
        }
    }
    return null
}

function at(row: unknown[], index: number): unknown {
    if (index < 0) return null
    return row[index]
}

function resolvePaymentKind(
    salesType: string | null,
    remarks: string | null,
    invoiceType: string | null,
): ParsedSalesLine['paymentKind'] {
    const blob = `${salesType ?? ''} ${remarks ?? ''} ${invoiceType ?? ''}`.toUpperCase()
    if (
        blob.includes('CHARGE') ||
        blob.includes('CREDIT') ||
        blob.includes('DOWNPAYMENT') ||
        blob.includes('DOWN PAYMENT')
    ) {
        return 'CHARGE'
    }
    if (blob.includes('CASH') || blob.includes('GCASH') || blob.includes('BANK')) {
        return 'CASH'
    }
    // Jan–May workbook often leaves sales type blank; remarks carries CASH/CHARGE.
    if ((remarks ?? '').toUpperCase().includes('CASH')) return 'CASH'
    return 'CASH'
}

function resolveChannel(location: string, customerName: string): 'POS' | 'ECOMMERCE' {
    const blob = `${location} ${customerName}`.toUpperCase()
    if (
        blob.includes('ONLINE') ||
        blob.includes('SHOPEE') ||
        blob.includes('SHOPPEE') ||
        blob.includes('LAZADA') ||
        blob.includes('TIKTOK')
    ) {
        return 'ECOMMERCE'
    }
    return 'POS'
}

export type ParseSalesResult = {
    lines: ParsedSalesLine[]
    dateFixedCount: number
}

export function parseMonthlySalesWorkbook(filePath: string): ParseSalesResult {
    const workbook = XLSX.readFile(filePath, { cellDates: true })
    const out: ParsedSalesLine[] = []
    let dateFixedCount = 0

    for (const sheetName of workbook.SheetNames) {
        if (SHEET_SKIP.has(sheetName.trim())) continue
        const sheetMeta = sheetMonthAndYear(sheetName)
        if (!sheetMeta) continue

        const rows: unknown[][] = XLSX.utils.sheet_to_json(
            workbook.Sheets[sheetName],
            { header: 1, defval: null, raw: true },
        )
        const header = findHeader(rows)
        if (!header) continue
        const { cols } = header

        for (let i = header.index + 1; i < rows.length; i++) {
            const row = rows[i] ?? []
            const particular = cellText(at(row, cols.particular))
            if (!particular) continue
            // Skip rolled-up TOTAL rows.
            if (/^TOTAL$/i.test(particular)) continue

            const rawDate = at(row, cols.date)
            // Parse without sheet first so DD/MM strings keep typed month;
            // then align when that month disagrees with the tab name.
            const rawParsed = parseDateCell(rawDate)
            if (!rawParsed) continue
            const aligned = alignDateToSheetMonth(
                rawParsed,
                sheetMeta.year,
                sheetMeta.month,
            )
            const saleDate = aligned.date
            const dateFixed = aligned.fixed
            if (dateFixed) dateFixedCount += 1

            const qtyRaw = cellAmount(at(row, cols.qty))
            const qty = qtyRaw > 0 ? qtyRaw : 1
            const srp = cellAmount(at(row, cols.srp))
            const sales = cellAmount(at(row, cols.sales))
            const discount = cellAmount(at(row, cols.discount))
            const subtotal = cellAmount(at(row, cols.subtotal))
            let totalSales = cellAmount(at(row, cols.totalSales))
            if (totalSales <= 0) totalSales = subtotal || sales || srp * qty
            if (totalSales <= 0.004 && srp <= 0) continue

            const customerName =
                cellText(at(row, cols.customer)) || 'Walk-in'
            const location = cellText(at(row, cols.location)) || 'STORE'
            const salesType = cellText(at(row, cols.salesType)) || null
            const invoiceType = cellText(at(row, cols.invoiceType)) || null
            const remarks = cellText(at(row, cols.remarks)) || null
            const receiptRaw = at(row, cols.receipt)
            const serviceReceipt =
                receiptRaw == null || receiptRaw === ''
                    ? null
                    : String(receiptRaw).trim()

            out.push({
                sheetName,
                saleDate,
                dateFixed,
                serviceReceipt,
                customerName,
                location,
                barcode: cellText(at(row, cols.barcode)) || null,
                accountTitle: cellText(at(row, cols.accountTitle)) || null,
                particular,
                qty,
                uom: cellText(at(row, cols.uom)) || null,
                cost: cellAmount(at(row, cols.cost)),
                srp: srp > 0 ? srp : sales > 0 ? sales / qty : totalSales / qty,
                sales: sales > 0 ? sales : srp * qty,
                discount,
                totalSales,
                salesType,
                invoiceType,
                invoiceNumber: cellText(at(row, cols.invoiceNumber)) || null,
                remarks,
                channel: resolveChannel(location, customerName),
                paymentKind: resolvePaymentKind(
                    salesType,
                    remarks,
                    invoiceType,
                ),
            })
        }
    }

    out.sort((a, b) => a.saleDate.getTime() - b.saleDate.getTime())
    return { lines: out, dateFixedCount }
}
