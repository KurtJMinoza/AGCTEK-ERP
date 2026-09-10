import { BadRequestException, Controller, Get, Query } from '@nestjs/common'

type NominatimSearchItem = {
    lat: string
    lon: string
    display_name: string
}

type NominatimReverse = {
    display_name?: string
}

/**
 * Thin Nominatim proxy — avoids browser CORS and keeps User-Agent server-side.
 * Used by Plan Trip location picker for stop lat/lng (Tracking pins).
 */
@Controller('scm/geocode')
export class GeocodeController {
    @Get('search')
    async search(
        @Query('q') q?: string,
        @Query('limit') limit?: string,
    ) {
        const query = typeof q === 'string' ? q.trim() : ''
        if (!query) {
            throw new BadRequestException('q is required')
        }
        const take = Math.min(8, Math.max(1, Number(limit) || 5))

        const url = new URL('https://nominatim.openstreetmap.org/search')
        url.searchParams.set('q', query)
        url.searchParams.set('format', 'json')
        url.searchParams.set('limit', String(take))

        const res = await fetch(url.toString(), {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'AGCTEK-ERP-SCM/1.0 (geocode-proxy)',
            },
        })
        if (!res.ok) {
            throw new BadRequestException('Address search failed')
        }

        const data = (await res.json()) as NominatimSearchItem[]
        return {
            data: data
                .map((item) => ({
                    lat: Number(item.lat),
                    lng: Number(item.lon),
                    displayName: item.display_name,
                }))
                .filter(
                    (item) =>
                        Number.isFinite(item.lat) && Number.isFinite(item.lng),
                ),
        }
    }

    @Get('reverse')
    async reverse(@Query('lat') lat?: string, @Query('lng') lng?: string) {
        const latitude = Number(lat)
        const longitude = Number(lng)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            throw new BadRequestException('lat and lng are required')
        }

        const url = new URL('https://nominatim.openstreetmap.org/reverse')
        url.searchParams.set('lat', String(latitude))
        url.searchParams.set('lon', String(longitude))
        url.searchParams.set('format', 'json')

        const res = await fetch(url.toString(), {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'AGCTEK-ERP-SCM/1.0 (geocode-proxy)',
            },
        })
        if (!res.ok) {
            throw new BadRequestException('Reverse geocode failed')
        }

        const data = (await res.json()) as NominatimReverse
        return {
            displayName: data.display_name?.trim() || null,
            lat: latitude,
            lng: longitude,
        }
    }
}
