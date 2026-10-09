import { BadRequestException, Controller, Get, Query } from '@nestjs/common'
import { PlacesService } from './places.service'
import { SCM_REFERENCE_READ } from '../../permissions/permissions.constants'
import { RequirePermission } from '../../permissions/permission.guard'

/**
 * GET /scm/places/search?q=&limit=&country=
 * Proxies Photon (or PLACES_PROVIDER_URL) — keep keys/rate limits server-side.
 */
@Controller('scm/places')
export class PlacesController {
    constructor(private readonly placesService: PlacesService) {}

    @Get('search')
    @RequirePermission(SCM_REFERENCE_READ, 'read')
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
