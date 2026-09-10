export function fmtMoney(value?: number | null) {
    if (value == null || Number.isNaN(Number(value))) return '—'
    return Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
