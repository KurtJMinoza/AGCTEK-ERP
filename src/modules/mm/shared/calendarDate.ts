/** Display API calendar dates without local timezone shifting the day. */
export function formatCalendarDate(iso: string | Date | null | undefined): string {
    if (!iso) return '—'
    const raw = typeof iso === 'string' ? iso : iso.toISOString()
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) {
        const y = Number(m[1])
        const month = Number(m[2])
        const day = Number(m[3])
        return new Date(Date.UTC(y, month - 1, day)).toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
        })
    }
    return new Date(iso).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}
