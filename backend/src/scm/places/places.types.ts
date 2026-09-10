/**
 * Places search — provider-agnostic DTO for SCM LocationSearchField.
 *
 * Default provider: Photon (OSM). Swap via PLACES_PROVIDER_URL / PHOTON_URL
 * (self-host Photon in production; public https://photon.komoot.io is for dev only).
 */
export type PlaceSuggestionDto = {
    id: string
    label: string
    address: string
    lat: number
    lng: number
    city?: string | null
    postalCode?: string | null
    country?: string | null
}
