import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import type { PlaceSuggestionDto } from './places.types'

type PhotonFeature = {
    geometry?: { coordinates?: [number, number] }
    properties?: {
        osm_type?: string
        osm_id?: number | string
        name?: string
        street?: string
        housenumber?: string
        city?: string
        town?: string
        village?: string
        municipality?: string
        locality?: string
        state?: string
        postcode?: string
        country?: string
        countrycode?: string
    }
}

type CacheEntry = {
    expiresAt: number
    data: PlaceSuggestionDto[]
}

const CACHE_TTL_MS = 60_000
const CACHE_MAX = 200

@Injectable()
export class PlacesService {
    private readonly logger = new Logger(PlacesService.name)
    private readonly cache = new Map<string, CacheEntry>()

    /**
     * Photon base URL (no trailing slash).
     * Dev default: public Komoot Photon — prefer a self-hosted instance in production.
     */
    private get providerBaseUrl(): string {
        const raw =
            process.env.PLACES_PROVIDER_URL ||
            process.env.PHOTON_URL ||
            'https://photon.komoot.io'
        return raw.replace(/\/$/, '')
    }

    async search(input: {
        q: string
        limit?: number
        country?: string
    }): Promise<PlaceSuggestionDto[]> {
        const q = input.q.trim()
        if (q.length < 3) {
            return []
        }

        const limit = Math.min(10, Math.max(1, input.limit ?? 5))
        const country = input.country?.trim() || ''
        const cacheKey = `${q.toLowerCase()}|${limit}|${country.toLowerCase()}`

        const hit = this.cache.get(cacheKey)
        if (hit && hit.expiresAt > Date.now()) {
            return hit.data
        }

        // Soft country bias: append to query (Photon has no universal country= param).
        const searchQ = country ? `${q}, ${country}` : q

        const url = new URL(`${this.providerBaseUrl}/api/`)
        url.searchParams.set('q', searchQ)
        url.searchParams.set('limit', String(limit))

        let res: Response
        try {
            res = await fetch(url.toString(), {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'AGCTEK-ERP-SCM/1.0 (places-proxy)',
                },
            })
        } catch (err) {
            this.logger.warn(
                `Places provider unreachable: ${err instanceof Error ? err.message : String(err)}`,
            )
            throw new BadRequestException('Place search unavailable')
        }

        if (!res.ok) {
            this.logger.warn(`Places provider HTTP ${res.status}`)
            throw new BadRequestException('Place search failed')
        }

        const body = (await res.json()) as { features?: PhotonFeature[] }
        const data = (body.features ?? [])
            .map((feature, index) => this.mapPhotonFeature(feature, index))
            .filter((item): item is PlaceSuggestionDto => item != null)

        this.putCache(cacheKey, data)
        return data
    }

    private mapPhotonFeature(
        feature: PhotonFeature,
        index: number,
    ): PlaceSuggestionDto | null {
        const coords = feature.geometry?.coordinates
        const props = feature.properties ?? {}
        if (!coords || coords.length < 2) return null

        const lng = Number(coords[0])
        const lat = Number(coords[1])
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

        const city =
            props.city ||
            props.town ||
            props.village ||
            props.municipality ||
            props.locality ||
            null

        const streetLine = [props.housenumber, props.street]
            .filter(Boolean)
            .join(' ')
            .trim()

        const parts = [
            props.name && props.name !== streetLine ? props.name : null,
            streetLine || null,
            city,
            props.state,
            props.postcode,
            props.country,
        ].filter(Boolean) as string[]

        const address = parts.join(', ')
        if (!address) return null

        const label = props.name
            ? [streetLine, city].filter(Boolean).length
                ? `${props.name} — ${[streetLine, city].filter(Boolean).join(', ')}`
                : props.name
            : address

        const id =
            props.osm_type && props.osm_id != null
                ? `${props.osm_type}:${props.osm_id}`
                : `photon-${lat.toFixed(5)}-${lng.toFixed(5)}-${index}`

        return {
            id,
            label,
            address,
            lat,
            lng,
            city,
            postalCode: props.postcode ?? null,
            country: props.country ?? props.countrycode ?? null,
        }
    }

    private putCache(key: string, data: PlaceSuggestionDto[]) {
        if (this.cache.size >= CACHE_MAX) {
            const first = this.cache.keys().next().value
            if (first) this.cache.delete(first)
        }
        this.cache.set(key, {
            expiresAt: Date.now() + CACHE_TTL_MS,
            data,
        })
    }
}
