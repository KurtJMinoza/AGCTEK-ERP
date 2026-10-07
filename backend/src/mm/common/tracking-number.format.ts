export const TRACKING_NUMBER_SEQ_WIDTH = 5

export function formatTrackingNumberLive(raw: string): string {
    if (!raw) return ''
    let s = raw.trim().toUpperCase()
    s = s.replace(/[\s_./\\]+/g, '-')
    s = s.replace(/[^A-Z0-9-]/g, '')
    s = s.replace(/-+/g, '-')
    return s
}

function padSequenceDigits(digits: string, width = TRACKING_NUMBER_SEQ_WIDTH): string {
    if (!digits || !/^\d+$/.test(digits)) return digits
    if (digits.length >= width) return digits
    return digits.padStart(width, '0')
}

function isYearSegment(part: string): boolean {
    return part.length === 4 && /^20\d{2}$/.test(part)
}

function formatSegment(part: string, index: number, parts: string[]): string {
    if (!/^\d+$/.test(part)) return part
    if (isYearSegment(part)) return part
    const isLast = index === parts.length - 1
    if (isLast || part.length < TRACKING_NUMBER_SEQ_WIDTH) {
        return padSequenceDigits(part)
    }
    return part
}

export function formatTrackingNumber(raw: string): string {
    let s = formatTrackingNumberLive(raw)
    s = s.replace(/^-|-$/g, '')
    if (!s) return ''

    if (!s.includes('-')) {
        const lettersThenDigits = s.match(/^([A-Z]+)(\d+)$/)
        if (lettersThenDigits) {
            const prefix = lettersThenDigits[1]
            const digits = lettersThenDigits[2]
            const yearSplit = digits.match(/^(20\d{2})(\d+)$/)
            if (yearSplit && digits.length > 5) {
                return `${prefix}-${yearSplit[1]}-${padSequenceDigits(yearSplit[2])}`
            }
            return `${prefix}-${padSequenceDigits(digits)}`
        }
        const digitsThenLetters = s.match(/^(\d+)([A-Z]+)$/)
        if (digitsThenLetters) {
            return `${padSequenceDigits(digitsThenLetters[1])}-${digitsThenLetters[2]}`
        }
        return s
    }

    const parts = s.split('-').filter(Boolean)
    return parts.map((part, i) => formatSegment(part, i, parts)).join('-')
}
