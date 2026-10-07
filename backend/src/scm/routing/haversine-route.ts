import { haversineKm } from '../scm.utils'

export type LatLng = { lat: number; lng: number }

export type HaversineRoute = {
    totalDistanceM: number
    totalDurationSec: number
    /** Straight stop-to-stop path as [lat, lng] */
    polyline: [number, number][]
    legDurationsSec: number[]
    legDistancesM: number[]
}

const DEFAULT_FALLBACK_SPEED_KMH = 40

/** Straight-line legs at a constant speed — an estimate used when OSRM is unavailable. */
export function computeHaversineLegs(stops: LatLng[]): HaversineRoute {
    const speedKmh = Number(process.env.ROUTE_FALLBACK_SPEED_KMH) || DEFAULT_FALLBACK_SPEED_KMH
    const legDistancesM: number[] = []
    const legDurationsSec: number[] = []
    for (let i = 1; i < stops.length; i++) {
        const km = haversineKm(stops[i - 1].lat, stops[i - 1].lng, stops[i].lat, stops[i].lng)
        legDistancesM.push(Math.round(km * 1000))
        legDurationsSec.push(Math.round((km / speedKmh) * 3600))
    }
    return {
        totalDistanceM: legDistancesM.reduce((s, d) => s + d, 0),
        totalDurationSec: legDurationsSec.reduce((s, d) => s + d, 0),
        polyline: stops.map((s) => [s.lat, s.lng]),
        legDurationsSec,
        legDistancesM,
    }
}
