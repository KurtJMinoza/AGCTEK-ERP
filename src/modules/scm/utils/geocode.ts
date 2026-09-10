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

/** Default map center (Manila) — matches existing geofence editor defaults. */
export const DEFAULT_MAP_CENTER = {
    lat: 14.5995,
    lng: 120.9842,
} as const
