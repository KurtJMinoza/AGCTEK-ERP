/** "Due today" is judged on the business calendar, not the server's or browser's clock zone. */
export const CRM_BUSINESS_TIME_ZONE = 'Asia/Manila'

export const NEXT_ACTIVITY_STATUSES = ['OVERDUE', 'DUE_TODAY', 'UPCOMING', 'NONE'] as const
export type NextActivityStatus = (typeof NEXT_ACTIVITY_STATUSES)[number]
export type ActivityDueStatus = Exclude<NextActivityStatus, 'NONE'> | 'DONE'

export type NextActivitySummary = {
    nextActivityStatus: NextActivityStatus
    nextActivityDueAt: Date | null
}

/** List filter: records that still accept activities and have an open activity past due. */
export const ACTIVITY_FILTERS = ['OVERDUE'] as const
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number]

export const NO_NEXT_ACTIVITY: NextActivitySummary = {
    nextActivityStatus: 'NONE',
    nextActivityDueAt: null,
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>()

function businessDay(date: Date, timeZone: string) {
    let formatter = dayFormatters.get(timeZone)
    if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        })
        dayFormatters.set(timeZone, formatter)
    }
    return formatter.format(date)
}

/** Overdue when the due instant has passed; otherwise due today or upcoming by business day. */
export function classifyDueAt(
    dueAt: Date,
    now: Date,
    timeZone = CRM_BUSINESS_TIME_ZONE,
): Exclude<NextActivityStatus, 'NONE'> {
    if (dueAt.getTime() < now.getTime()) return 'OVERDUE'
    return businessDay(dueAt, timeZone) === businessDay(now, timeZone) ? 'DUE_TODAY' : 'UPCOMING'
}

export function activityDueStatus(
    activity: { dueAt: Date; doneAt: Date | null },
    now: Date,
    timeZone = CRM_BUSINESS_TIME_ZONE,
): ActivityDueStatus {
    return activity.doneAt ? 'DONE' : classifyDueAt(activity.dueAt, now, timeZone)
}

/**
 * One badge per record from its open activities: overdue > due today > upcoming > none.
 * The earliest open due date always carries the highest-priority status, so it decides both fields.
 */
export function summarizeNextActivity(
    openDueDates: Date[],
    now: Date,
    timeZone = CRM_BUSINESS_TIME_ZONE,
): NextActivitySummary {
    if (openDueDates.length === 0) return NO_NEXT_ACTIVITY
    const earliest = openDueDates.reduce((min, d) => (d.getTime() < min.getTime() ? d : min))
    return {
        nextActivityStatus: classifyDueAt(earliest, now, timeZone),
        nextActivityDueAt: earliest,
    }
}
