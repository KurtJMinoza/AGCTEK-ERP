/** Format amounts using the material's currency (e.g. PHP → ₱1,470.00). */
export function formatMaterialMoney(
    amount: number,
    currencyCode?: string | null,
    locale = 'en-PH',
): string {
    const n = Number(amount)
    if (!Number.isFinite(n)) return '—'
    const code = currencyCode?.trim()
    if (code) {
        try {
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: code,
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
            }).format(n)
        } catch {
            return `${code} ${n.toLocaleString(locale, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            })}`
        }
    }
    return n.toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
}
