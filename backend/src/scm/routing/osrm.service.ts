import { Injectable, Logger } from '@nestjs/common'
import type { LatLng } from './haversine-route'

export interface OsrmRouteResult {
    totalDistanceM: number
    totalDurationSec: number
    /** Road geometry as [lat, lng] for Leaflet */
    polyline: [number, number][]
    legDurationsSec: number[]
    legDistancesM: number[]
}

type OsrmRouteResponse = {
    code: string
    message?: string
    routes?: Array<{
        distance: number
        duration: number
        /** GeoJSON LineString — coordinates are [lng, lat] */
        geometry: { type: 'LineString'; coordinates: Array<[number, number]> }
        legs: Array<{ distance: number; duration: number }>
    }>
}

const DEFAULT_TIMEOUT_MS = 5000

/**
 * OSRM HTTP client: coordinates → road distance, duration, legs, polyline.
 * Never throws — any failure (unset URL, timeout, HTTP / OSRM error) returns null
 * so the caller can fall back to the haversine estimate.
 */
@Injectable()
export class OsrmService {
    private readonly logger = new Logger(OsrmService.name)

    get baseUrl(): string | null {
        return process.env.OSRM_BASE_URL?.trim().replace(/\/+$/, '') || null
    }

    async getRoute(stops: LatLng[]): Promise<OsrmRouteResult | null> {
        const baseUrl = this.baseUrl
        if (!baseUrl || stops.length < 2) return null

        // OSRM expects lng,lat
        const coords = stops.map((s) => `${s.lng},${s.lat}`).join(';')
        const url = `${baseUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`
        const timeoutMs = Number(process.env.OSRM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        try {
            const res = await fetch(url, {
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            })
            if (!res.ok) {
                this.logger.warn(`OSRM HTTP ${res.status} — falling back to haversine`)
                return null
            }
            const data = (await res.json()) as OsrmRouteResponse
            const route = data.routes?.[0]
            if (data.code !== 'Ok' || !route) {
                this.logger.warn(`OSRM ${data.code}: ${data.message ?? 'no route'} — falling back to haversine`)
                return null
            }
            if (route.legs.length !== stops.length - 1) {
                this.logger.warn('OSRM leg count does not match stops — falling back to haversine')
                return null
            }
            return {
                totalDistanceM: Math.round(route.distance),
                totalDurationSec: Math.round(route.duration),
                polyline: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
                legDurationsSec: route.legs.map((l) => Math.round(l.duration)),
                legDistancesM: route.legs.map((l) => Math.round(l.distance)),
            }
        } catch (err) {
            const reason = controller.signal.aborted
                ? `timeout after ${timeoutMs} ms`
                : err instanceof Error
                  ? err.message
                  : String(err)
            this.logger.error(`OSRM request failed (${reason}) — falling back to haversine`)
            return null
        } finally {
            clearTimeout(timer)
        }
    }
}
