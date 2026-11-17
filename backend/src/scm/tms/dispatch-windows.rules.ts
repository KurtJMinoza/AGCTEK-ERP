/**
 * Dispatch time-window gate — pure (no Prisma / HTTP).
 * Same schedule semantics as route preview, but legs always come from the
 * haversine estimate: a router outage must never block or unblock a dispatch.
 */

import type { TripStopType } from '@prisma/client'
import { computeHaversineLegs } from '../routing/haversine-route'
import {
    defaultServiceMinutes,
    windowViolations,
    type ScheduleStop,
} from './route-schedule'

export type DispatchWindowStop = {
    sequence: number
    stopType: TripStopType | null
    lat: number | null
    lng: number | null
    windowStart: Date | null
    windowEnd: Date | null
}

/**
 * Human-readable window problems for the trip as sequenced, departing at
 * max(now, plannedStartAt). Empty when no stop has a window or a stop lacks
 * coordinates (stop-location validation reports those).
 */
export function dispatchWindowIssues(
    stops: DispatchWindowStop[],
    plannedStartAt: Date | null,
    now: Date,
): string[] {
    const ordered = [...stops].sort((a, b) => a.sequence - b.sequence)
    if (ordered.length < 2) return []
    if (!ordered.some((s) => s.windowStart != null || s.windowEnd != null)) return []
    if (ordered.some((s) => s.lat == null || s.lng == null)) return []

    const route = computeHaversineLegs(ordered.map((s) => ({ lat: s.lat!, lng: s.lng! })))
    const legs = route.legDurationsSec.map((durationSec, i) => ({
        durationSec,
        distanceM: route.legDistancesM[i],
    }))
    const serviceSec = defaultServiceMinutes() * 60
    const scheduleStops: ScheduleStop[] = ordered.map((s) => ({
        key: String(s.sequence),
        stopType: s.stopType ?? 'TO',
        windowStart: s.windowStart,
        windowEnd: s.windowEnd,
        serviceSec: s.stopType === 'RETURN' ? 0 : serviceSec,
    }))
    const departAt = new Date(Math.max(now.getTime(), plannedStartAt?.getTime() ?? 0))

    return windowViolations(scheduleStops, legs, departAt).map((v) =>
        v.code === 'WINDOW_CONFLICT'
            ? `stop #${v.key}: window opens too late for later deliveries`
            : `stop #${v.key}: about ${Math.ceil(v.lateBySec / 60)} min after its window closes`,
    )
}
