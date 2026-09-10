import { BadRequestException, Controller, Get, Query } from '@nestjs/common'
import { PlacesService } from './places.service'

/**
 * GET /scm/places/search?q=&limit=&country=
 * Proxies Photon (or PLACES_PROVIDER_URL) — keep keys/rate limits server-side.
 */
@Controller('scm/places')
export class PlacesController {
    constructor(private readonly placesService: PlacesService) {}

    @Get('search')
    search(
        @Query('q') q?: string,
        @Query('limit') limit?: string,
        @Query('country') country?: string,
    ) {
        const query = typeof q === 'string' ? q.trim() : ''
        if (!query) {
            throw new BadRequestException('q is required')
        }
        return this.placesService.search({
            q: query,
            limit: Number(limit) || 5,
            country: typeof country === 'string' ? country : undefined,
        })
    }
}
