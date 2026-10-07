import { BadRequestException, Injectable } from '@nestjs/common'

type NominatimSearchItem = {
    lat: string
    lon: string
    display_name: string
}

type NominatimReverse = {
    display_name?: string
}

export type GeocodeHit = { lat: number; lng: number; displayName: string }

const USER_AGENT = 'AGCTEK-ERP-SCM/1.0 (geocode-proxy)'

/** Thin Nominatim client — shared by the geocode proxy and route preview. */
@Injectable()
export class GeocodeService {
    async search(query: string, limit = 5, timeoutMs?: number): Promise<GeocodeHit[]> {
        const url = new URL('https://nominatim.openstreetmap.org/search')
        url.searchParams.set('q', query)
        url.searchParams.set('format', 'json')
        url.searchParams.set('limit', String(limit))

        const res = await fetch(url.toString(), {
            headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
            signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
        })
        if (!res.ok) {
            throw new BadRequestException('Address search failed')
        }
        const data = (await res.json()) as NominatimSearchItem[]
        return data
            .map((item) => ({
                lat: Number(item.lat),
                lng: Number(item.lon),
                displayName: item.display_name,
            }))
            .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
    }

    async reverse(lat: number, lng: number): Promise<string | null> {
        const url = new URL('https://nominatim.openstreetmap.org/reverse')
        url.searchParams.set('lat', String(lat))
        url.searchParams.set('lon', String(lng))
        url.searchParams.set('format', 'json')

        const res = await fetch(url.toString(), {
            headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        })
        if (!res.ok) {
            throw new BadRequestException('Reverse geocode failed')
        }
        const data = (await res.json()) as NominatimReverse
        return data.display_name?.trim() || null
    }
}
