/** Pluggable planning calendar for lead-time and bucket date normalization. */
export interface PlanningCalendarPort {
    readonly mode: string
    normalizeBucketDate(d: Date): Date
    addDays(from: Date, days: number): Date
    subtractDays(to: Date, days: number): Date
}
