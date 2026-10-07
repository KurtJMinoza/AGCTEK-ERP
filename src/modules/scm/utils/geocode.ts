import {
    apiGeocodeReverse,
    apiGeocodeSearch,
} from '../services/scmApi'

/** OpenStreetMap helpers via backend proxies.
 * Address autocomplete UX: prefer LocationSearchField → GET /scm/places/search (Photon).
 * These Nominatim helpers remain for map picker reverse geocode.
 */

export type GeocodeResult = {
    lat: number
    lng: number
    displayName: string
}

export async function searchAddress(
    query: string,
    limit = 5,
): Promise<GeocodeResult[]> {
    const q = query.trim()
    if (!q) return []
    return apiGeocodeSearch(q, limit)
}

export async function reverseGeocode(
    lat: number,
    lng: number,
): Promise<string | null> {
    const result = await apiGeocodeReverse(lat, lng)
    return result.displayName
}

/**
 * Parse typed coordinates: "14.23011, 121.07346", "14.23011 121.07346" or
 * "14.23011° N, 121.07346° E". Order is latitude, longitude; when the first
 * value cannot be a latitude but the second can, they are treated as lng, lat.
 * Returns null for anything else (including out-of-range values and 0,0).
 */
export function parseCoordinates(input: string): { lat: number; lng: number } | null {
    const match = input
        .trim()
        .match(/^(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([NSns])?\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EWew])?$/)
    if (!match) return null
    let a = Number(match[1])
    let b = Number(match[3])
    if (match[2]?.toUpperCase() === 'S') a = -Math.abs(a)
    if (match[4]?.toUpperCase() === 'W') b = -Math.abs(b)
    const isLat = (v: number) => Math.abs(v) <= 90
    const isLng = (v: number) => Math.abs(v) <= 180
    let lat = a
    let lng = b
    if (!isLat(a) && isLat(b) && isLng(a) && !match[2] && !match[4]) {
        lat = b
        lng = a
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    if (!isLat(lat) || !isLng(lng) || (lat === 0 && lng === 0)) return null
    return { lat, lng }
}

/** Default map center (Manila) — matches existing geofence editor defaults. */
export const DEFAULT_MAP_CENTER = {
    lat: 14.5995,
    lng: 120.9842,
} as const
