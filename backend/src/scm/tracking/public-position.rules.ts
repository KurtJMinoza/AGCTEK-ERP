/**
 * Customer-facing (public) vehicle position policy. Staff fleet tracking stays
 * live; shoppers only ever see a position at least `delaySeconds` old, never
 * the vehicle / plate / device identity.
 */

export const DEFAULT_PUBLIC_DELAY_SECONDS = 150
export const DEFAULT_LAST_MILE_DELAY_SECONDS = 60
export const DEFAULT_PUBLIC_STALE_SECONDS = 20 * 60

const MAX_DELAY_SECONDS = 30 * 60

export type PublicTrackingPolicy = {
    delaySeconds: number
    lastMileDelaySeconds: number
    staleSeconds: number
}

function envSeconds(
    raw: string | undefined,
    fallback: number,
    max: number,
): number {
    if (raw == null || raw.trim() === '') return fallback
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) return fallback
    return Math.min(Math.round(n), max)
}

/** Reads PUBLIC_TRACKING_DELAY_SECONDS / _LAST_MILE_DELAY_SECONDS / _STALE_SECONDS. */
export function publicTrackingPolicy(
    env: Record<string, string | undefined> = process.env,
): PublicTrackingPolicy {
    const delaySeconds = envSeconds(
        env.PUBLIC_TRACKING_DELAY_SECONDS,
        DEFAULT_PUBLIC_DELAY_SECONDS,
        MAX_DELAY_SECONDS,
    )
    return {
        delaySeconds,
        lastMileDelaySeconds: Math.min(
            envSeconds(
                env.PUBLIC_TRACKING_LAST_MILE_DELAY_SECONDS,
                DEFAULT_LAST_MILE_DELAY_SECONDS,
                MAX_DELAY_SECONDS,
            ),
            delaySeconds,
        ),
        staleSeconds: envSeconds(
            env.PUBLIC_TRACKING_STALE_SECONDS,
            DEFAULT_PUBLIC_STALE_SECONDS,
            24 * 60 * 60,
        ),
    }
}

/** Latest position the public may see: recordedAt <= now - delay. */
export function publicCutoff(now: Date, delaySeconds: number): Date {
    return new Date(now.getTime() - delaySeconds * 1000)
}

export type PublicGpsPoint = {
    latitude: number
    longitude: number
    heading: number | null
    recordedAt: Date
}

export type PublicMapUnavailableReason =
    | 'NOT_IN_TRANSIT'
    | 'NO_GPS_YET'
    | 'WAITING_FOR_UPDATE'

export type PublicMapDto = {
    available: boolean
    reason: PublicMapUnavailableReason | null
    delaySeconds: number
    lastMile: boolean
    latitude: number | null
    longitude: number | null
    heading: number | null
    recordedAt: string | null
    lastUpdatedLabel: string | null
    /** Arrival window at the shopper's stop; only while the map is available. */
    eta: DeliveryEta | null
}

export type DeliveryEta = {
    from: string
    to: string
    /** `road` = OSRM; `straight_line` = haversine fallback (rougher). */
    basis: 'road' | 'straight_line'
}

export const DEFAULT_STOP_SERVICE_SECONDS = 5 * 60
const ETA_MIN_SPREAD_SECONDS = 10 * 60
const ETA_SPREAD_RATIO = 0.25
const ETA_ROUND_MS = 5 * 60_000

/** Seconds a courier spends at each stop before the shopper's (PUBLIC_TRACKING_STOP_SERVICE_SECONDS). */
export function stopServiceSeconds(env: Record<string, string | undefined> = process.env): number {
    return envSeconds(env.PUBLIC_TRACKING_STOP_SERVICE_SECONDS, DEFAULT_STOP_SERVICE_SECONDS, 60 * 60)
}

/**
 * Arrival window from the delayed point: travel + service time at stops still
 * ahead of the shopper. Never earlier than now; widened by max(10 min, 25% of
 * travel) and snapped outward to 5-minute marks so it reads as an estimate.
 */
export function estimateDeliveryWindow(input: {
    pointRecordedAt: Date
    travelSeconds: number
    stopsBefore: number
    serviceSecondsPerStop: number
    basis: DeliveryEta['basis']
    now: Date
}): DeliveryEta {
    const { pointRecordedAt, travelSeconds, stopsBefore, serviceSecondsPerStop, basis, now } = input
    const aheadMs =
        (Math.max(0, travelSeconds) + Math.max(0, stopsBefore) * serviceSecondsPerStop) * 1000
    const arrival = Math.max(pointRecordedAt.getTime() + aheadMs, now.getTime())
    const spreadMs =
        Math.max(ETA_MIN_SPREAD_SECONDS, travelSeconds * ETA_SPREAD_RATIO) * 1000
    const from = Math.floor(arrival / ETA_ROUND_MS) * ETA_ROUND_MS
    const to = Math.ceil((arrival + spreadMs) / ETA_ROUND_MS) * ETA_ROUND_MS
    return {
        from: new Date(Math.max(from, now.getTime())).toISOString(),
        to: new Date(to).toISOString(),
        basis,
    }
}

export function lastUpdatedLabel(recordedAt: Date, now: Date): string {
    const minutes = Math.max(
        0,
        Math.floor((now.getTime() - recordedAt.getTime()) / 60_000),
    )
    if (minutes < 1) return 'Updated just now'
    if (minutes === 1) return 'Updated about 1 minute ago'
    if (minutes < 60) return `Updated about ${minutes} minutes ago`
    const hours = Math.floor(minutes / 60)
    return hours === 1
        ? 'Updated about 1 hour ago'
        : `Updated about ${hours} hours ago`
}

function unavailable(
    reason: PublicMapUnavailableReason,
    delaySeconds: number,
    lastMile: boolean,
): PublicMapDto {
    return {
        available: false,
        reason,
        delaySeconds,
        lastMile,
        latitude: null,
        longitude: null,
        heading: null,
        recordedAt: null,
        lastUpdatedLabel: null,
        eta: null,
    }
}

/**
 * Builds the shopper map payload. A point older than `staleSeconds` is hidden
 * ("Waiting for update") so a dead pin is never presented as current.
 */
export function toPublicMap(input: {
    inTransit: boolean
    point: PublicGpsPoint | null
    delaySeconds: number
    lastMile: boolean
    staleSeconds: number
    now: Date
}): PublicMapDto {
    const { inTransit, point, delaySeconds, lastMile, staleSeconds, now } = input
    if (!inTransit) return unavailable('NOT_IN_TRANSIT', delaySeconds, lastMile)
    if (!point) return unavailable('NO_GPS_YET', delaySeconds, lastMile)
    const ageSeconds = (now.getTime() - point.recordedAt.getTime()) / 1000
    if (ageSeconds > staleSeconds) {
        return unavailable('WAITING_FOR_UPDATE', delaySeconds, lastMile)
    }
    return {
        available: true,
        reason: null,
        delaySeconds,
        lastMile,
        latitude: point.latitude,
        longitude: point.longitude,
        heading: point.heading,
        recordedAt: point.recordedAt.toISOString(),
        lastUpdatedLabel: lastUpdatedLabel(point.recordedAt, now),
        eta: null,
    }
}
