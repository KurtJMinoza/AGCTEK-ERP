/**
 * Geofence UI model — matches Nest / Prisma; Tile38 holds live geometry + hooks.
 */
export type GeofenceKind = 'HUB' | 'CHECKPOINT' | 'ZONE'

export type GeofenceZone = {
    id: string
    code: string
    name: string
    kind: GeofenceKind
    lat: number
    lng: number
    /** Circular radius in meters */
    radiusM: number
    color?: string | null
    active?: boolean
    notes?: string | null
    createdAt?: string
    updatedAt?: string
}

export type GeofenceDetect = 'ENTER' | 'EXIT' | 'INSIDE' | 'OUTSIDE'

export type GeofenceEvent = {
    id: string
    geofenceId: string
    geofenceCode?: string
    geofenceName?: string
    vehicleId: string
    detect: GeofenceDetect | string
    latitude: number
    longitude: number
    detectedAt: string
}
