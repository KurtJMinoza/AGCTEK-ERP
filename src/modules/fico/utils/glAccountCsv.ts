import type { FicoGlAccount, FicoGlImportRow } from '../types'

/**
 * CSV file handling for G/L import/export. Only shapes the file — every
 * accounting rule (groups, ranges, duplicates, balances) is enforced by the
 * `/fico/gl-accounts/import` endpoint.
 */

export const GL_IMPORT_COLUMNS = [
    'accountCode',
    'accountName',
    'accountGroupCode',
    'accountType',
    'normalBalance',
    'description',
    'isPostingAccount',
    'allowManualPosting',
    'isReconciliationAccount',
    'reconciliationType',
] as const

const BOOLEAN_COLUMNS = new Set([
    'isPostingAccount',
    'allowManualPosting',
    'isReconciliationAccount',
])

const escapeCsv = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

function downloadCsv(fileName: string, lines: string[][]) {
    const csv = lines.map((line) => line.map(escapeCsv).join(',')).join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
}

export function downloadGlAccountsCsv(accounts: FicoGlAccount[]) {
    const header = [...GL_IMPORT_COLUMNS, 'chartCode', 'status']
    const rows = accounts.map((account) => [
        account.accountCode,
        account.accountName,
        account.accountGroup?.code ?? '',
        account.accountType,
        account.normalBalance,
        account.description ?? '',
        account.isPostingAccount ? 'yes' : 'no',
        account.allowManualPosting ? 'yes' : 'no',
        account.isReconciliationAccount ? 'yes' : 'no',
        account.reconciliationType ?? '',
        account.chartOfAccounts?.code ?? '',
        account.status,
    ])
    downloadCsv(`gl-accounts-${new Date().toISOString().slice(0, 10)}.csv`, [
        header,
        ...rows,
    ])
}

export function downloadGlImportTemplate() {
    downloadCsv('gl-accounts-import-template.csv', [
        [...GL_IMPORT_COLUMNS],
        ['1010', 'Cash in Bank', 'ASSET', '', '', 'Cash deposited in company bank accounts', 'yes', 'yes', 'no', ''],
        ['1510', 'Accumulated Depreciation', 'ASSET', '', 'CREDIT', 'Contra-asset', 'yes', 'yes', 'no', ''],
    ])
}

/** RFC 4180 parsing: quoted fields, escaped quotes, commas and line breaks in quotes. */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let field = ''
    let quoted = false
    const source = text.replace(/^\uFEFF/, '')
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index]
        if (quoted) {
            if (char === '"' && source[index + 1] === '"') {
                field += '"'
                index += 1
            } else if (char === '"') {
                quoted = false
            } else {
                field += char
            }
            continue
        }
        if (char === '"') quoted = true
        else if (char === ',') {
            row.push(field)
            field = ''
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && source[index + 1] === '\n') index += 1
            row.push(field)
            rows.push(row)
            row = []
            field = ''
        } else field += char
    }
    if (field !== '' || row.length > 0) {
        row.push(field)
        rows.push(row)
    }
    return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

function toBoolean(value: string): boolean | undefined {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return undefined
    if (['yes', 'y', 'true', '1'].includes(normalized)) return true
    if (['no', 'n', 'false', '0'].includes(normalized)) return false
    return undefined
}

export type ParsedGlImport = {
    rows: FicoGlImportRow[]
    missingColumns: string[]
}

export function parseGlImportCsv(text: string): ParsedGlImport {
    const [header = [], ...body] = parseCsv(text)
    const columns = header.map((cell) => cell.trim())
    const required = ['accountCode', 'accountName', 'accountGroupCode']
    const missingColumns = required.filter((name) => !columns.includes(name))
    if (missingColumns.length) return { rows: [], missingColumns }

    const rows = body.map((cells) => {
        const record: Record<string, string | boolean | undefined> = {}
        columns.forEach((column, index) => {
            if (!(GL_IMPORT_COLUMNS as readonly string[]).includes(column)) return
            const value = (cells[index] ?? '').trim()
            if (BOOLEAN_COLUMNS.has(column)) {
                const flag = toBoolean(value)
                if (flag !== undefined) record[column] = flag
            } else if (value) {
                record[column] = value
            }
        })
        return {
            ...record,
            accountCode: String(record.accountCode ?? ''),
            accountName: String(record.accountName ?? ''),
            accountGroupCode: String(record.accountGroupCode ?? ''),
        } as FicoGlImportRow
    })
    return { rows, missingColumns }
}
