/** Calendar day helpers for CRM activity planning (Asia/Manila YYYY-MM-DD keys). */

const DAY_MS = 24 * 60 * 60 * 1000

export type CalendarView = 'week' | 'month'

/** Parse YYYY-MM-DD as a Manila calendar day → UTC instant at local midnight. */
export function manilaDayStart(day: string): Date {
    const [y, m, d] = day.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d) - 8 * 60 * 60 * 1000)
}

/** Inclusive end of a Manila calendar day (last ms before next midnight). */
export function manilaDayEnd(day: string): Date {
    return new Date(manilaDayStart(day).getTime() + DAY_MS - 1)
}

export function addManilaDays(day: string, delta: number): string {
    const start = manilaDayStart(day)
    return formatManilaDay(new Date(start.getTime() + delta * DAY_MS))
}

export function formatManilaDay(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date)
}

export function todayManila(): string {
    return formatManilaDay(new Date())
}

/** Monday-start week containing `day` (YYYY-MM-DD). */
export function weekRange(day: string): { start: string; end: string; days: string[] } {
    const startMs = manilaDayStart(day).getTime()
    // getUTCDay after shifting +8h gives Manila weekday
    const manila = new Date(startMs + 8 * 60 * 60 * 1000)
    const weekday = manila.getUTCDay() // 0 Sun … 6 Sat
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday
    const start = addManilaDays(day, mondayOffset)
    const days = Array.from({ length: 7 }, (_, i) => addManilaDays(start, i))
    return { start, end: days[6], days }
}

/** Month grid Mon–Sun covering the month of `day`. */
export function monthRange(day: string): { start: string; end: string; days: string[] } {
    const [y, m] = day.split('-').map(Number)
    const first = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDayNum = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const last = `${y}-${String(m).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`
    const { start } = weekRange(first)
    const { end } = weekRange(last)
    const days: string[] = []
    let cursor = start
    while (cursor <= end) {
        days.push(cursor)
        cursor = addManilaDays(cursor, 1)
    }
    return { start, end, days }
}

export function shiftAnchor(day: string, view: CalendarView, delta: number): string {
    if (view === 'week') return addManilaDays(day, delta * 7)
    const [y, m] = day.split('-').map(Number)
    const next = new Date(Date.UTC(y, m - 1 + delta, 1))
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export function rangeLabel(view: CalendarView, anchor: string): string {
    if (view === 'week') {
        const { start, end } = weekRange(anchor)
        return `${start} → ${end}`
    }
    const [y, m] = anchor.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    })
}
