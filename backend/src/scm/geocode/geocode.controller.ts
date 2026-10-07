import { BadRequestException, Controller, Get, Query } from '@nestjs/common'
import { GeocodeService } from './geocode.service'

/**
 * Thin Nominatim proxy — avoids browser CORS and keeps User-Agent server-side.
 * Used by Plan Trip location picker for stop lat/lng (Tracking pins).
 */
@Controller('scm/geocode')
export class GeocodeController {
    constructor(private readonly geocode: GeocodeService) {}

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
        return { data: await this.geocode.search(query, take) }
    }

    @Get('reverse')
    async reverse(@Query('lat') lat?: string, @Query('lng') lng?: string) {
        const latitude = Number(lat)
        const longitude = Number(lng)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            throw new BadRequestException('lat and lng are required')
        }
        return {
            displayName: await this.geocode.reverse(latitude, longitude),
            lat: latitude,
            lng: longitude,
        }
    }
}
