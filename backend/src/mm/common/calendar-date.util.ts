import { BadRequestException } from '@nestjs/common'

/** Parse HTML `YYYY-MM-DD` as a stable calendar date (UTC noon). */
export function parseCalendarDateString(value?: string): Date | null {
    if (!value?.trim()) return null
    const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) {
        throw new BadRequestException('Invalid date; use YYYY-MM-DD')
    }
    const y = Number(m[1])
    const month = Number(m[2])
    const day = Number(m[3])
    const d = new Date(Date.UTC(y, month - 1, day, 12, 0, 0))
    if (
        d.getUTCFullYear() !== y ||
        d.getUTCMonth() !== month - 1 ||
        d.getUTCDate() !== day
    ) {
        throw new BadRequestException('Invalid date')
    }
    return d
}
