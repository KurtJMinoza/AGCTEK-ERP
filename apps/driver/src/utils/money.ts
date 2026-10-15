const SYMBOLS: Record<string, string> = { PHP: '₱' }

export function formatMoney(value: number, currency = 'PHP'): string {
    const amount = value.toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
    const symbol = SYMBOLS[currency]
    return symbol ? `${symbol}${amount}` : `${currency} ${amount}`
}
