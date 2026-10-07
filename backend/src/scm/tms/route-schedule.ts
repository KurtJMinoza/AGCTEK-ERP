/**
 * Route preview schedule math — pure functions (no Prisma / HTTP).
 * Stop 0 is the first PICKUP; `departAt` is the departure from it (loading done).
 * ETAs are never clamped to fit windows: early arrivals wait, late arrivals are LATE.
 * A window is met only when service at the stop finishes by the window end.
 */

import type { TmsStopType } from './tms.rules'

export type WindowStatus = 'NO_WINDOW' | 'EARLY' | 'OK' | 'LATE'

export type ScheduleStop = {
    key: string
    stopType: TmsStopType
    windowStart: Date | null
    windowEnd: Date | null
    /** Dwell at this stop (ignored for stop 0, whose departure is `departAt`). */
    serviceSec: number
}

export type ScheduleLeg = { durationSec: number; distanceM: number }

export type ScheduledStop = {
    key: string
    arrivalAt: Date | null
    waitSec: number
    serviceStartAt: Date | null
    departureAt: Date | null
    windowStatus: WindowStatus
    lateBySec: number
}

const MS = 1000

/** Forward pass on the current sequence: cumulative ETA, waiting, window status. */
export function computeSchedule(
    stops: ScheduleStop[],
    legs: ScheduleLeg[],
    departAt: Date,
): ScheduledStop[] {
    if (legs.length !== Math.max(0, stops.length - 1)) {
        throw new Error('legs must have exactly stops.length - 1 entries')
    }
    const result: ScheduledStop[] = []
    let departure = departAt.getTime()

    stops.forEach((stop, index) => {
        if (index === 0) {
            result.push({
                key: stop.key,
                arrivalAt: null,
                waitSec: 0,
                serviceStartAt: null,
                departureAt: new Date(departure),
                windowStatus: windowStatusAt(stop, departure, departure),
                lateBySec: lateBy(stop, departure),
            })
            return
        }
        const arrival = departure + legs[index - 1].durationSec * MS
        const ws = stop.windowStart?.getTime()
        const waitMs = ws != null && arrival < ws ? ws - arrival : 0
        const serviceStart = arrival + waitMs
        departure = serviceStart + stop.serviceSec * MS
        result.push({
            key: stop.key,
            arrivalAt: new Date(arrival),
            waitSec: Math.round(waitMs / MS),
            serviceStartAt: new Date(serviceStart),
            departureAt: new Date(departure),
            windowStatus: windowStatusAt(stop, arrival, departure),
            lateBySec: lateBy(stop, departure),
        })
    })
    return result
}

function windowStatusAt(stop: ScheduleStop, arrival: number, serviceEnd: number): WindowStatus {
    const ws = stop.windowStart?.getTime()
    const we = stop.windowEnd?.getTime()
    if (ws == null && we == null) return 'NO_WINDOW'
    if (we != null && serviceEnd > we) return 'LATE'
    if (ws != null && arrival < ws) return 'EARLY'
    return 'OK'
}

function lateBy(stop: ScheduleStop, serviceEnd: number): number {
    const we = stop.windowEnd?.getTime()
    return we != null && serviceEnd > we ? Math.round((serviceEnd - we) / MS) : 0
}

export type DepartureBound = {
    /** Latest departure from stop 0 that still meets every window end; null = no deadline. */
    latestDepartureAt: Date | null
    /** Stops whose window opens too late for a downstream deadline — no departure can fix them. */
    conflictKeys: string[]
}

/**
 * Backward pass: latest allowed service start at each stop is
 *   min(windowEnd_i − service_i, latestStart_{i+1} − leg_i − service_i).
 * Waiting for an early window cannot help a downstream deadline, so a stop whose
 * windowStart is after its latest allowed service start is an unfixable conflict.
 */
export function latestFeasibleDeparture(
    stops: ScheduleStop[],
    legs: ScheduleLeg[],
): DepartureBound {
    if (stops.length < 2) return { latestDepartureAt: null, conflictKeys: [] }
    const conflictKeys: string[] = []
    let latest = Number.POSITIVE_INFINITY

    for (let i = stops.length - 1; i >= 1; i--) {
        const stop = stops[i]
        const downstream =
            i === stops.length - 1
                ? Number.POSITIVE_INFINITY
                : latest - (legs[i].durationSec + stop.serviceSec) * MS
        const we = stop.windowEnd?.getTime()
        latest = Math.min(
            we == null ? Number.POSITIVE_INFINITY : we - stop.serviceSec * MS,
            downstream,
        )
        const ws = stop.windowStart?.getTime()
        if (ws != null && Number.isFinite(latest) && ws > latest) {
            conflictKeys.push(stop.key)
        }
    }

    if (!Number.isFinite(latest)) {
        return { latestDepartureAt: null, conflictKeys: conflictKeys.reverse() }
    }
    return {
        latestDepartureAt: new Date(latest - legs[0].durationSec * MS),
        conflictKeys: conflictKeys.reverse(),
    }
}

/**
 * Departure that reaches the first windowed stop exactly when its window opens.
 * Stops before it have no window start, so nothing waits on the way; null when
 * no stop has a window start.
 */
export function windowOpeningDeparture(
    stops: ScheduleStop[],
    legs: ScheduleLeg[],
): Date | null {
    let offset = 0
    for (let i = 1; i < stops.length; i++) {
        offset += legs[i - 1].durationSec * MS
        const ws = stops[i].windowStart?.getTime()
        if (ws != null) return new Date(ws - offset)
        offset += stops[i].serviceSec * MS
    }
    return null
}

/** ON_TIME = latest departure meeting every window end; EARLY = arrive as the first window opens. */
export type DepartureMode = 'ON_TIME' | 'EARLY'

export type DepartureRecommendation = {
    at: Date
    feasible: boolean
    basis:
        | 'LATEST_MEETING_WINDOWS'
        | 'EARLIEST_MEETING_WINDOWS'
        | 'NO_DEADLINES'
        | 'EARLIEST_PRACTICAL'
    reason: string | null
    conflictKeys: string[]
}

const floorMinute = (t: number) => Math.floor(t / 60000) * 60000
const ceilMinute = (t: number) => Math.ceil(t / 60000) * 60000

/**
 * ON_TIME: latest departure from PICKUP that meets all windows when that is still
 * in the future. EARLY: departure that reaches the first window as it opens,
 * capped by the ON_TIME bound and never before now. Otherwise the earliest
 * practical departure (now) flagged infeasible.
 */
export function recommendDeparture(
    stops: ScheduleStop[],
    legs: ScheduleLeg[],
    now: Date,
    mode: DepartureMode = 'ON_TIME',
): DepartureRecommendation {
    const earliest = new Date(ceilMinute(now.getTime()))
    const { latestDepartureAt, conflictKeys } = latestFeasibleDeparture(stops, legs)

    if (conflictKeys.length > 0) {
        return {
            at: earliest,
            feasible: false,
            basis: 'EARLIEST_PRACTICAL',
            reason: 'Delivery windows conflict with travel and service time — no departure meets them all',
            conflictKeys,
        }
    }
    const latest = latestDepartureAt ? floorMinute(latestDepartureAt.getTime()) : null
    if (latest != null && latest < earliest.getTime()) {
        return {
            at: earliest,
            feasible: false,
            basis: 'EARLIEST_PRACTICAL',
            reason: 'The latest departure that meets every window has already passed',
            conflictKeys,
        }
    }

    if (mode === 'EARLY') {
        const opening = windowOpeningDeparture(stops, legs)
        if (opening == null && latest == null) {
            return { at: earliest, feasible: true, basis: 'NO_DEADLINES', reason: null, conflictKeys }
        }
        let at = opening == null ? earliest.getTime() : ceilMinute(opening.getTime())
        if (latest != null) at = Math.min(at, latest)
        at = Math.max(at, earliest.getTime())
        return {
            at: new Date(at),
            feasible: true,
            basis: 'EARLIEST_MEETING_WINDOWS',
            reason: null,
            conflictKeys,
        }
    }

    if (latest == null) {
        return { at: earliest, feasible: true, basis: 'NO_DEADLINES', reason: null, conflictKeys }
    }
    return {
        at: new Date(latest),
        feasible: true,
        basis: 'LATEST_MEETING_WINDOWS',
        reason: null,
        conflictKeys,
    }
}
