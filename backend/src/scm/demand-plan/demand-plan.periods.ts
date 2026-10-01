import type {
    DemandHorizonKind,
    DemandPlanBucket,
    DemandPlanGranularity,
} from '@prisma/client'

export type HorizonPreset = {
    kind: DemandHorizonKind
    label: string
    bucket: DemandPlanBucket
    viewLength: number
    granularity: DemandPlanGranularity
    freezeFencePeriods: number
    /** Strategic view is aggregate-only; no cell edits. */
    readOnly: boolean
}

export const HORIZON_PRESETS: Record<DemandHorizonKind, HorizonPreset> = {
    OPERATIONAL: {
        kind: 'OPERATIONAL',
        label: 'Operational',
        bucket: 'WEEK',
        viewLength: 12,
        granularity: 'SKU',
        freezeFencePeriods: 2,
        readOnly: false,
    },
    TACTICAL: {
        kind: 'TACTICAL',
        label: 'Tactical (S&OP)',
        bucket: 'MONTH',
        viewLength: 18,
        granularity: 'FAMILY',
        freezeFencePeriods: 1,
        readOnly: false,
    },
    STRATEGIC: {
        kind: 'STRATEGIC',
        label: 'Strategic',
        bucket: 'QUARTER',
        viewLength: 8,
        granularity: 'FAMILY',
        freezeFencePeriods: 0,
        readOnly: true,
    },
}

export const MAX_VIEW_LENGTH: Record<DemandPlanBucket, number> = {
    WEEK: 52,
    MONTH: 36,
    QUARTER: 20,
}

/** Postgres `date_trunc` unit per bucket (whitelist — used as raw SQL). */
export const TRUNC_UNIT: Record<DemandPlanBucket, 'week' | 'month' | 'quarter'> =
    {
        WEEK: 'week',
        MONTH: 'month',
        QUARTER: 'quarter',
    }

/** Start of the period containing `d` (UTC). Weeks start Monday, matching Postgres date_trunc('week'). */
export function periodStartOf(d: Date, bucket: DemandPlanBucket): Date {
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth()
    if (bucket === 'MONTH') return new Date(Date.UTC(y, m, 1))
    if (bucket === 'QUARTER') return new Date(Date.UTC(y, m - (m % 3), 1))
    const day = new Date(Date.UTC(y, m, d.getUTCDate()))
    const dow = day.getUTCDay()
    day.setUTCDate(day.getUTCDate() - (dow === 0 ? 6 : dow - 1))
    return day
}

export function addPeriods(
    start: Date,
    bucket: DemandPlanBucket,
    n: number,
): Date {
    const d = new Date(start)
    if (bucket === 'WEEK') d.setUTCDate(d.getUTCDate() + n * 7)
    else d.setUTCMonth(d.getUTCMonth() + n * (bucket === 'QUARTER' ? 3 : 1))
    return d
}

export function buildPeriods(
    rangeStart: Date,
    bucket: DemandPlanBucket,
    viewLength: number,
    freezeUntil: Date,
) {
    const periods: Array<{
        key: string
        label: string
        start: string
        end: string
        frozen: boolean
    }> = []
    for (let i = 0; i < viewLength; i += 1) {
        const start = addPeriods(rangeStart, bucket, i)
        const end = addPeriods(rangeStart, bucket, i + 1)
        periods.push({
            key: periodKey(start),
            label: periodLabel(start, bucket),
            start: start.toISOString(),
            end: end.toISOString(),
            frozen: start.getTime() < freezeUntil.getTime(),
        })
    }
    return periods
}

export function periodKey(d: Date): string {
    return d.toISOString().slice(0, 10)
}

const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
]

export function periodLabel(d: Date, bucket: DemandPlanBucket): string {
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth()
    if (bucket === 'QUARTER') return `Q${Math.floor(m / 3) + 1} ${y}`
    if (bucket === 'MONTH') return `${MONTHS[m]} ${y}`
    return `${MONTHS[m]} ${d.getUTCDate()}`
}

/** Freeze fence: periods starting before this instant are locked. Rolls with the current period. */
export function freezeUntilFor(
    bucket: DemandPlanBucket,
    freezeFencePeriods: number,
    now = new Date(),
): Date {
    return addPeriods(periodStartOf(now, bucket), bucket, freezeFencePeriods)
}
