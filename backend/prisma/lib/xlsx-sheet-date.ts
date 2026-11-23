/**
 * Excel sheet-month date helpers for SD report imports.
 *
 * Workbooks often put a wrong calendar month on a row that still sits on a
 * JANUARY / FEBRUARY / … sheet. Reporting uses Asia/Manila day boundaries, so
 * we normalize every parsed cell to Manila midnight inside the sheet month,
 * keeping the day-of-month when it is valid.
 */

export const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

const MONTH_NAME: Record<string, number> = {
    JANUARY: 1,
    FEBRUARY: 2,
    MARCH: 3,
    APRIL: 4,
    MAY: 5,
    JUNE: 6,
    JULY: 7,
    AUGUST: 8,
    SEPTEMBER: 9,
    OCTOBER: 10,
    NOVEMBER: 11,
    DECEMBER: 12,
}

export function sheetMonthAndYear(
    sheetName: string,
    fallbackYear = 2026,
): { year: number; month: number } | null {
    const upper = sheetName.trim().toUpperCase()
    const monthMatch = upper.match(
        /(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)/,
    )
    if (!monthMatch) return null
    const yearMatch = upper.match(/(20\d{2})/)
    return {
        month: MONTH_NAME[monthMatch[1]],
        year: yearMatch ? Number(yearMatch[1]) : fallbackYear,
    }
}

/** Excel 1900-date serial → UTC instant at Manila noon of that serial day. */
export function excelSerialToDate(serial: number): Date {
    const utcDays = serial - 25569
    const d = new Date(utcDays * 86400 * 1000)
    d.setUTCHours(12, 0, 0, 0)
    return d
}

export function manilaParts(date: Date): {
    year: number
    month: number
    day: number
} {
    const local = new Date(date.getTime() + MANILA_OFFSET_MS)
    return {
        year: local.getUTCFullYear(),
        month: local.getUTCMonth() + 1,
        day: local.getUTCDate(),
    }
}

/** Manila calendar midnight as a UTC instant. */
export function manilaMidnight(
    year: number,
    month: number,
    day: number,
): Date {
    return new Date(Date.UTC(year, month - 1, day) - MANILA_OFFSET_MS)
}

function lastDayOfMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Force `date` into the sheet's year/month, keeping the Manila day-of-month
 * (clamped). Used when Excel rows were typed with the wrong month.
 */
export function alignDateToSheetMonth(
    date: Date,
    year: number,
    month: number,
): { date: Date; fixed: boolean } {
    const parts = manilaParts(date)
    if (parts.year === year && parts.month === month) {
        return { date: manilaMidnight(year, month, parts.day), fixed: false }
    }
    const day = Math.min(parts.day, lastDayOfMonth(year, month))
    return { date: manilaMidnight(year, month, day), fixed: true }
}

/**
 * Parse a DATE cell. Handles Date objects, Excel serials, ISO strings, and
 * PH-style `DD/MM/YYYY` / `DD/MM.YYYY` (common typo with a dot).
 */
export function parseDateCell(
    value: unknown,
    sheet?: { year: number; month: number },
): Date | null {
    if (value == null || value === '') return null

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return sheet
            ? alignDateToSheetMonth(value, sheet.year, sheet.month).date
            : value
    }

    if (typeof value === 'number' && value > 20000) {
        const raw = excelSerialToDate(value)
        return sheet
            ? alignDateToSheetMonth(raw, sheet.year, sheet.month).date
            : raw
    }

    const text = String(value).trim()
    if (!text) return null

    const dmy = text.match(
        /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/,
    )
    if (dmy) {
        const day = Number(dmy[1])
        const month = Number(dmy[2])
        let year = Number(dmy[3])
        if (year < 100) year += 2000
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            const targetMonth = sheet?.month ?? month
            const targetYear = sheet?.year ?? year
            // Prefer sheet month when the typed month disagrees with the tab.
            if (sheet && month !== sheet.month) {
                const safeDay = Math.min(
                    day,
                    lastDayOfMonth(targetYear, targetMonth),
                )
                return manilaMidnight(targetYear, targetMonth, safeDay)
            }
            const safeDay = Math.min(
                day,
                lastDayOfMonth(targetYear, targetMonth),
            )
            return manilaMidnight(targetYear, targetMonth, safeDay)
        }
    }

    const parsed = new Date(text)
    if (Number.isNaN(parsed.getTime())) return null
    return sheet
        ? alignDateToSheetMonth(parsed, sheet.year, sheet.month).date
        : parsed
}
