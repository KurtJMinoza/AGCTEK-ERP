export function formatMoney(amount: number, currency = 'PHP'): string {
    try {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
        }).format(amount)
    } catch {
        return `${currency} ${amount.toFixed(2)}`
    }
}

export function formatDateTime(iso: string): string {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return iso
    try {
        return new Intl.DateTimeFormat('en-PH', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        }).format(date)
    } catch {
        return date.toLocaleString()
    }
}
