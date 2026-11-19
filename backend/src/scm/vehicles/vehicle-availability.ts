/** Trip statuses that reserve a vehicle (DRAFT / COMPLETED / CANCELLED do not). */
export const VEHICLE_RESERVING_TRIP_STATUSES = [
    'PLANNED',
    'READY',
    'DISPATCHED',
    'ASSIGNED',
    'IN_TRANSIT',
] as const

/** Trips without an end time are assumed to occupy the vehicle for this long. */
export const DEFAULT_TRIP_DURATION_MS = 12 * 60 * 60 * 1000

export type TripWindowLike = {
    status: string
    plannedStartAt: Date | null
    plannedEndAt: Date | null
    startedAt: Date | null
}

/**
 * Half-open overlap of a trip's occupied interval with `[from, to)`.
 * - IN_TRANSIT with no planned end occupies the vehicle until it completes (open-ended).
 * - A trip with no planned start and not started is treated as "unscheduled": it blocks
 *   the vehicle (conservative) because ops has already committed it.
 */
export function tripOverlapsWindow(trip: TripWindowLike, from: Date, to: Date): boolean {
    const start = trip.startedAt ?? trip.plannedStartAt
    if (!start) return true
    const end =
        trip.plannedEndAt ??
        (trip.status === 'IN_TRANSIT'
            ? new Date(8.64e15)
            : new Date(start.getTime() + DEFAULT_TRIP_DURATION_MS))
    return start.getTime() < to.getTime() && end.getTime() > from.getTime()
}
