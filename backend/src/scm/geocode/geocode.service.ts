import { BadRequestException, Injectable } from '@nestjs/common'

type NominatimSearchItem = {
    lat: string
    lon: string
    display_name: string
}

type NominatimReverse = {
    display_name?: string
    name?: string
    address?: {
        house_number?: string
        road?: string
        pedestrian?: string
        footway?: string
        neighbourhood?: string
        suburb?: string
        quarter?: string
        village?: string
        town?: string
        city?: string
        municipality?: string
        county?: string
        state?: string
        region?: string
        postcode?: string
        country?: string
    }
}

export type GeocodeHit = { lat: number; lng: number; displayName: string }
export type ReverseGeocodeHit = {
    formattedAddress: string | null
    addressLine: string | null
    barangayOrNeighborhood: string | null
    cityOrMunicipality: string | null
    provinceOrState: string | null
    postalCode: string | null
    country: string | null
}

const USER_AGENT = 'AGCTEK-ERP-SCM/1.0 (geocode-proxy)'

/** Thin Nominatim client — shared by the geocode proxy and route preview. */
@Injectable()
export class GeocodeService {
    private readonly cache = new Map<
        string,
        { expiresAt: number; value: GeocodeHit[] | ReverseGeocodeHit }
    >()
    private nextRequestAt = 0

    async search(
        query: string,
        limit = 5,
        timeoutMs?: number,
    ): Promise<GeocodeHit[]> {
        const normalizedQuery = query.trim()
        if (!normalizedQuery) return []
        const cacheKey = `search:${normalizedQuery.toLowerCase()}:${limit}`
        const cached = this.cached<GeocodeHit[]>(cacheKey)
        if (cached) return cached

        const url = new URL('https://nominatim.openstreetmap.org/search')
        url.searchParams.set('q', normalizedQuery)
        url.searchParams.set('format', 'json')
        url.searchParams.set('limit', String(limit))

        await this.throttle()
        let res: Response
        try {
            res = await fetch(url.toString(), {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': USER_AGENT,
                },
                signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
            })
        } catch {
            throw new BadRequestException('Address search unavailable')
        }
        if (!res.ok) {
            throw new BadRequestException('Address search failed')
        }
        const data = (await res.json()) as NominatimSearchItem[]
        const result = data
            .map((item) => ({
                lat: Number(item.lat),
                lng: Number(item.lon),
                displayName: item.display_name,
            }))
            .filter(
                (item) =>
                    Number.isFinite(item.lat) && Number.isFinite(item.lng),
            )
        this.putCache(cacheKey, result)
        return result
    }

    async reverse(lat: number, lng: number): Promise<string | null> {
        return (await this.reverseStructured(lat, lng)).formattedAddress
    }

    async reverseStructured(
        lat: number,
        lng: number,
    ): Promise<ReverseGeocodeHit> {
        const cacheKey = `reverse:${lat.toFixed(6)}:${lng.toFixed(6)}`
        const cached = this.cached<ReverseGeocodeHit>(cacheKey)
        if (cached) return cached

        const url = new URL('https://nominatim.openstreetmap.org/reverse')
        url.searchParams.set('lat', String(lat))
        url.searchParams.set('lon', String(lng))
        url.searchParams.set('format', 'json')

        await this.throttle()
        let res: Response
        try {
            res = await fetch(url.toString(), {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': USER_AGENT,
                },
            })
        } catch {
            throw new BadRequestException('Reverse geocode unavailable')
        }
        if (!res.ok) {
            throw new BadRequestException('Reverse geocode failed')
        }
        const data = (await res.json()) as NominatimReverse
        const address = data.address ?? {}
        const result: ReverseGeocodeHit = {
            formattedAddress: data.display_name?.trim() || null,
            addressLine:
                [
                    address.house_number,
                    address.road ?? address.pedestrian ?? address.footway,
                ]
                    .filter(Boolean)
                    .join(' ') ||
                data.name?.trim() ||
                null,
            barangayOrNeighborhood:
                address.neighbourhood ??
                address.suburb ??
                address.quarter ??
                null,
            cityOrMunicipality:
                address.city ??
                address.town ??
                address.village ??
                address.municipality ??
                address.county ??
                null,
            provinceOrState: address.state ?? address.region ?? null,
            postalCode: address.postcode ?? null,
            country: address.country ?? null,
        }
        this.putCache(cacheKey, result)
        return result
    }

    private cached<T extends GeocodeHit[] | ReverseGeocodeHit>(
        key: string,
    ): T | null {
        const entry = this.cache.get(key)
        if (!entry || entry.expiresAt <= Date.now()) {
            if (entry) this.cache.delete(key)
            return null
        }
        return entry.value as T
    }

    private putCache(key: string, value: GeocodeHit[] | ReverseGeocodeHit) {
        if (this.cache.size >= 200) {
            const first = this.cache.keys().next().value
            if (first) this.cache.delete(first)
        }
        this.cache.set(key, { expiresAt: Date.now() + 60_000, value })
    }

    /** Nominatim public usage is kept to at most one uncached request per second. */
    private async throttle() {
        const now = Date.now()
        const scheduled = Math.max(now, this.nextRequestAt)
        this.nextRequestAt = scheduled + 1_000
        const wait = scheduled - now
        if (wait > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, wait))
        }
    }
}
