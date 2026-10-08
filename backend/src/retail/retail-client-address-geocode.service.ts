import { Injectable } from '@nestjs/common'
import { GeocodeService } from '../scm/geocode/geocode.service'
import { PlacesService } from '../scm/places/places.service'

/** Retail adapter over the shared OSM-compatible providers; no browser API keys. */
@Injectable()
export class RetailClientAddressGeocodeService {
    constructor(
        private readonly geocode: GeocodeService,
        private readonly places: PlacesService,
    ) {}

    search(query: string, limit = 5) {
        return this.places.search({
            q: query,
            limit: Math.min(8, Math.max(1, limit)),
            country: 'Philippines',
        })
    }

    reverse(latitude: number, longitude: number) {
        return this.geocode.reverseStructured(latitude, longitude)
    }
}
