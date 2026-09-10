import type { FleetTrackingItem, GpsLog, VehicleStatus } from '../types'

export type GpsFixQuality = 'none' | 'stale' | 'fair' | 'good' | 'excellent'

export type FleetMarkerKind = 'en_route' | 'active' | 'idle' | 'offline'

export type TrackingMetrics = {
    totalTripDistanceKm: number | null
    averageJourneySpeedKmh: number | null
    gpsFixQuality: GpsFixQuality
    odometerKm: number | null
    currentSpeedKmh: number | null
}

const EARTH_KM = 6371

export function haversineKm(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number },
): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180
    const dLat = toRad(b.lat - a.lat)
    const dLng = toRad(b.lng - a.lng)
    const lat1 = toRad(a.lat)
    const lat2 = toRad(b.lat)
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
    return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function pathDistanceKm(points: GpsLog[]): number | null {
    if (points.length < 2) return null
    const ordered = [...points].sort(
        (a, b) =>
            new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
    )
    let sum = 0
    for (let i = 1; i < ordered.length; i += 1) {
        sum += haversineKm(
            { lat: ordered[i - 1].latitude, lng: ordered[i - 1].longitude },
            { lat: ordered[i].latitude, lng: ordered[i].longitude },
        )
    }
    return sum
}

export function averageSpeedKmh(points: GpsLog[]): number | null {
    if (points.length === 0) return null
    const speeds = points
        .map((p) => p.speedKmh)
        .filter((s) => Number.isFinite(s) && s >= 0)
    if (speeds.length === 0) return null
    return speeds.reduce((a, b) => a + b, 0) / speeds.length
}

/** Dispatcher-facing fix quality from last ping age (not OBD / HDOP). */
export function gpsFixQuality(
    latest: GpsLog | null,
    nowMs = Date.now(),
): GpsFixQuality {
    if (!latest) return 'none'
    const ageMs = nowMs - new Date(latest.recordedAt).getTime()
    if (!Number.isFinite(ageMs) || ageMs < 0) return 'fair'
    if (ageMs <= 60_000) return 'excellent'
    if (ageMs <= 5 * 60_000) return 'good'
    if (ageMs <= 30 * 60_000) return 'fair'
    return 'stale'
}

export function formatFixQuality(quality: GpsFixQuality): string {
    switch (quality) {
        case 'excellent':
            return 'Excellent'
        case 'good':
            return 'Good'
        case 'fair':
            return 'Fair'
        case 'stale':
            return 'Stale'
        default:
            return 'No fix'
    }
}

export function fleetMarkerKind(item: FleetTrackingItem): FleetMarkerKind {
    if (!item.latest) return 'offline'
    const status = item.vehicle.status as VehicleStatus
    if (status === 'IN_TRANSIT' || item.activeTrip?.status === 'IN_TRANSIT') {
        return 'en_route'
    }
    if (item.latest.speedKmh >= 5) return 'active'
    return 'idle'
}

export function markerKindColor(kind: FleetMarkerKind): string {
    switch (kind) {
        case 'en_route':
            return '#22c55e'
        case 'active':
            return '#38bdf8'
        case 'idle':
            return '#f59e0b'
        default:
            return '#64748b'
    }
}

export function computeTrackingMetrics(
    item: FleetTrackingItem | null,
    history: GpsLog[],
): TrackingMetrics {
    if (!item) {
        return {
            totalTripDistanceKm: null,
            averageJourneySpeedKmh: null,
            gpsFixQuality: 'none',
            odometerKm: null,
            currentSpeedKmh: null,
        }
    }

    const distance = pathDistanceKm(history)
    const avgFromHistory = averageSpeedKmh(history)

    return {
        totalTripDistanceKm: distance,
        averageJourneySpeedKmh:
            avgFromHistory ??
            (item.latest != null ? item.latest.speedKmh : null),
        gpsFixQuality: gpsFixQuality(item.latest),
        odometerKm: item.vehicle.odometerKm,
        currentSpeedKmh: item.latest?.speedKmh ?? null,
    }
}
