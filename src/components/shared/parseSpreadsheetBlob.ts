import * as XLSX from 'xlsx'

export type SpreadsheetSheet = {
    name: string
    headers: string[]
    rows: string[][]
    truncated: boolean
}

export type SpreadsheetPreviewData = {
    sheets: SpreadsheetSheet[]
}

const MAX_ROWS = 500
const MAX_COLS = 50

function normalizeCell(value: unknown): string {
    if (value === null || value === undefined) return ''
    return String(value)
}

function matrixFromSheet(sheet: XLSX.WorkSheet): string[][] {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        raw: false,
    })

    return matrix.map((row) => {
        const cells = Array.isArray(row) ? row : [row]
        return cells.slice(0, MAX_COLS).map(normalizeCell)
    })
}

export async function parseSpreadsheetBlob(
    blob: Blob,
): Promise<SpreadsheetPreviewData> {
    const buffer = await blob.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })

    const sheets = workbook.SheetNames.map((name) => {
        const matrix = matrixFromSheet(workbook.Sheets[name])
        const truncated =
            matrix.length > MAX_ROWS ||
            matrix.some((row) => row.length >= MAX_COLS)

        const limited = matrix.slice(0, MAX_ROWS)
        const headerRow = limited[0] ?? []
        const hasHeader = headerRow.some((cell) => cell.trim().length > 0)
        const headers = hasHeader
            ? headerRow
            : headerRow.map((_, index) => `Column ${index + 1}`)
        const rows = hasHeader ? limited.slice(1) : limited

        const columnCount = Math.max(
            headers.length,
            ...rows.map((row) => row.length),
            1,
        )

        const normalizedHeaders = Array.from({ length: columnCount }, (_, i) =>
            headers[i]?.trim() ? headers[i] : `Column ${i + 1}`,
        )
        const normalizedRows = rows.map((row) =>
            Array.from({ length: columnCount }, (_, i) => row[i] ?? ''),
        )

        return {
            name,
            headers: normalizedHeaders,
            rows: normalizedRows,
            truncated,
        }
    })

    return { sheets }
}
