import * as XLSX from 'xlsx'
import {
    alignDateToSheetMonth,
    parseDateCell,
    sheetMonthAndYear,
} from './xlsx-sheet-date'

export type ParsedCollectionLine = {
    sheetName: string
    collectionDate: Date
    dateFixed: boolean
    arNumber: string | null
    customerName: string
    particular: string
    cash: number
    gcash: number
    bankTransfer: number
    cheque: number
    others: number
    total: number
    paymentMethod:
        | 'CASH'
        | 'GCASH'
        | 'BANK_TRANSFER'
        | 'CHEQUE'
        | 'OTHERS'
}

const SHEET_SKIP = new Set(['TOTAL', 'Sheet2'])

function cellText(value: unknown): string {
    if (value == null) return ''
    return String(value).trim()
}

function cellAmount(value: unknown): number {
    if (value == null || value === '') return 0
    if (typeof value === 'number' && Number.isFinite(value)) return value
    const text = String(value).replace(/[^\d.-]/g, '')
    const n = parseFloat(text)
    return Number.isFinite(n) ? n : 0
}

function rowLooksLikeHeader(cells: unknown[]): boolean {
    const joined = cells.map(cellText).join('\t').toUpperCase()
    return (
        joined.includes('CUSTOMER NAME') &&
        joined.includes('PARTICULAR') &&
        joined.includes('TOTAL')
    )
}

function detectPaymentMethod(
    line: Omit<ParsedCollectionLine, 'paymentMethod' | 'sheetName' | 'dateFixed'>,
): ParsedCollectionLine['paymentMethod'] {
    const buckets: Array<[ParsedCollectionLine['paymentMethod'], number]> = [
        ['CASH', line.cash],
        ['GCASH', line.gcash],
        ['BANK_TRANSFER', line.bankTransfer],
        ['CHEQUE', line.cheque],
        ['OTHERS', line.others],
    ]
    const positive = buckets.filter(([, v]) => v > 0.004)
    if (positive.length === 1) return positive[0][0]
    if (positive.length > 1) {
        positive.sort((a, b) => b[1] - a[1])
        return positive[0][0]
    }
    if (line.total > 0) return 'CASH'
    return 'OTHERS'
}

export function parseMonthlyCollectionWorkbook(
    filePath: string,
): ParsedCollectionLine[] {
    const workbook = XLSX.readFile(filePath, { cellDates: true })
    const out: ParsedCollectionLine[] = []
    let fixedCount = 0

    for (const sheetName of workbook.SheetNames) {
        if (SHEET_SKIP.has(sheetName)) continue
        const sheetMeta = sheetMonthAndYear(sheetName)
        if (!sheetMeta) continue

        const sheet = workbook.Sheets[sheetName]
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: '',
            raw: true,
        })

        let headerIndex = -1
        for (let i = 0; i < rows.length; i++) {
            if (rowLooksLikeHeader(rows[i] ?? [])) {
                headerIndex = i
                break
            }
        }
        if (headerIndex < 0) continue

        for (let i = headerIndex + 1; i < rows.length; i++) {
            const row = rows[i] ?? []
            const nonEmpty = row.some(
                (c) => cellText(c) !== '' && cellAmount(c) !== 0,
            )
            if (!nonEmpty) continue

            const rawDate = row[0]
            const rawParsed = parseDateCell(rawDate)
            if (!rawParsed) continue
            const aligned = alignDateToSheetMonth(
                rawParsed,
                sheetMeta.year,
                sheetMeta.month,
            )
            const collectionDate = aligned.date
            const dateFixed = aligned.fixed
            if (dateFixed) fixedCount += 1

            const arNumber = cellText(row[1]) || null
            const customerName = cellText(row[2]) || 'Walk-in'
            const particular = cellText(row[3]) || 'Collection'
            const cash = cellAmount(row[4])
            const gcash = cellAmount(row[5])
            const bankTransfer = cellAmount(row[6])
            const cheque = cellAmount(row[7])
            const others = cellAmount(row[8])
            let total = cellAmount(row[9])
            if (total <= 0) {
                total = cash + gcash + bankTransfer + cheque + others
            }
            if (total <= 0.004) continue

            const base = {
                collectionDate,
                dateFixed,
                arNumber,
                customerName,
                particular,
                cash,
                gcash,
                bankTransfer,
                cheque,
                others,
                total,
            }

            out.push({
                sheetName,
                ...base,
                paymentMethod: detectPaymentMethod(base),
            })
        }
    }

    out.sort(
        (a, b) =>
            a.collectionDate.getTime() - b.collectionDate.getTime(),
    )
    if (fixedCount > 0) {
        console.log(
            `Monthly Collection: aligned ${fixedCount} row date(s) to their sheet month.`,
        )
    }
    return out
}
