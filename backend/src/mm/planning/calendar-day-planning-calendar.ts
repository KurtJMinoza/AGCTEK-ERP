import type { PlanningCalendarPort } from './planning-calendar.port'

function dayStartUtc(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Default calendar: plain UTC calendar days (matches Phase 2A behavior). */
export class CalendarDayPlanningCalendar implements PlanningCalendarPort {
    readonly mode = 'CALENDAR_DAY'

    normalizeBucketDate(d: Date): Date {
        return dayStartUtc(d)
    }

    addDays(from: Date, days: number): Date {
        const result = dayStartUtc(from)
        result.setUTCDate(result.getUTCDate() + days)
        return result
    }

    subtractDays(to: Date, days: number): Date {
        return this.addDays(to, -days)
    }
}
