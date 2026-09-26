import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common'
import Redis from 'ioredis'

const FLEET_KEY = 'scm:fleet'
const GEOFENCE_KEY = 'scm:geofences'

/**
 * Tile38 geolocation DB (RESP / Redis protocol).
 * Stores fleet points + circular geofences; SETHOOK for enter/exit.
 * Degrades gracefully when Tile38 is offline.
 */
@Injectable()
export class Tile38Service implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(Tile38Service.name)
    private client: Redis | null = null
    private ready = false

    get isReady() {
        return this.ready
    }

    get fleetKey() {
        return FLEET_KEY
    }

    get geofenceKey() {
        return GEOFENCE_KEY
    }

    async onModuleInit() {
        const host = process.env.TILE38_HOST || '127.0.0.1'
        const port = Number(process.env.TILE38_PORT) || 9851

        try {
            this.client = new Redis({
                host,
                port,
                lazyConnect: true,
                maxRetriesPerRequest: 1,
                enableReadyCheck: false,
                connectTimeout: 3000,
            })

            this.client.on('error', (err) => {
                this.ready = false
                this.logger.warn(`Tile38 connection error: ${err.message}`)
            })

            await this.client.connect()
            const pong = await this.client.call('PING')
            this.ready = String(pong).toUpperCase() === 'PONG'
            this.logger.log(
                this.ready
                    ? `Tile38 connected at ${host}:${port}`
                    : `Tile38 ping unexpected response at ${host}:${port}`,
            )
        } catch (err) {
            this.ready = false
            this.client = null
            this.logger.warn(
                `Tile38 unavailable (${host}:${port}) — geofence live detect disabled. ${
                    err instanceof Error ? err.message : String(err)
                }`,
            )
        }
    }

    async onModuleDestroy() {
        if (this.client) {
            await this.client.quit().catch(() => undefined)
            this.client = null
            this.ready = false
        }
    }

    /** SET scm:fleet {vehicleId} POINT lat lng */
    async setFleetPoint(vehicleId: string, lat: number, lng: number) {
        if (!this.ready || !this.client) return false
        try {
            await this.client.call(
                'SET',
                FLEET_KEY,
                vehicleId,
                'POINT',
                String(lat),
                String(lng),
            )
            return true
        } catch (err) {
            this.logger.warn(
                `Tile38 SET fleet failed: ${err instanceof Error ? err.message : String(err)}`,
            )
            return false
        }
    }

    /**
     * Store a circular geofence as a GeoJSON Polygon.
     * Tile38 SET does not accept CIRCLE — only POINT | BOUNDS | HASH | OBJECT | STRING.
     * CIRCLE is only valid on search/hook commands (NEARBY / WITHIN / INTERSECTS).
     */
    async setGeofenceCircle(
        id: string,
        lat: number,
        lng: number,
        radiusM: number,
    ) {
        if (!this.ready || !this.client) return false
        try {
            const geojson = circleToGeoJsonPolygon(lat, lng, radiusM)
            await this.client.call(
                'SET',
                GEOFENCE_KEY,
                id,
                'OBJECT',
                geojson,
            )
            return true
        } catch (err) {
            this.logger.warn(
                `Tile38 SET geofence failed: ${err instanceof Error ? err.message : String(err)}`,
            )
            return false
        }
    }

    async deleteGeofence(id: string) {
        if (!this.ready || !this.client) return false
        try {
            await this.client.call('DEL', GEOFENCE_KEY, id)
            await this.deleteHook(this.hookName(id))
            return true
        } catch (err) {
            this.logger.warn(
                `Tile38 DEL geofence failed: ${err instanceof Error ? err.message : String(err)}`,
            )
            return false
        }
    }

    /**
     * Live fence around a hub: when fleet points enter/exit the circle,
     * Tile38 POSTs to TILE38_HOOK_BASE_URL/api/v1/scm/tracking/geofence-hook
     */
    async syncNearbyHook(
        geofenceId: string,
        lat: number,
        lng: number,
        radiusM: number,
    ) {
        if (!this.ready || !this.client) return false

        const base = (
            process.env.TILE38_HOOK_BASE_URL ||
            process.env.API_PUBLIC_URL ||
            'http://127.0.0.1:3011'
        ).replace(/\/$/, '')
        // Nest listens under the global prefix `/api/v1`
        const origin = base.replace(/\/api\/v1$/i, '')
        const endpoint = `${origin}/api/v1/scm/tracking/geofence-hook`
        const name = this.hookName(geofenceId)

        try {
            await this.deleteHook(name)
            await this.client.call(
                'SETHOOK',
                name,
                endpoint,
                'NEARBY',
                FLEET_KEY,
                'FENCE',
                'DETECT',
                'enter,exit',
                'POINT',
                String(lat),
                String(lng),
                String(radiusM),
            )
            return true
        } catch (err) {
            this.logger.warn(
                `Tile38 SETHOOK failed: ${err instanceof Error ? err.message : String(err)}`,
            )
            return false
        }
    }

    async deleteHook(name: string) {
        if (!this.ready || !this.client) return false
        try {
            await this.client.call('DELHOOK', name)
            return true
        } catch {
            return false
        }
    }

    /**
     * Fallback when hooks cannot reach Nest: which geofences contain this point?
     * Returns Tile38 object ids (our geofence ids).
     */
    async intersectsGeofences(lat: number, lng: number): Promise<string[]> {
        if (!this.ready || !this.client) return []
        try {
            const raw = (await this.client.call(
                'INTERSECTS',
                GEOFENCE_KEY,
                'IDS',
                'POINT',
                String(lat),
                String(lng),
            )) as unknown

            // Tile38 INTERSECTS IDS → [count, id1, id2, ...] or nested
            return flattenIds(raw)
        } catch (err) {
            this.logger.warn(
                `Tile38 INTERSECTS failed: ${err instanceof Error ? err.message : String(err)}`,
            )
            return []
        }
    }

    hookName(geofenceId: string) {
        return `scm:hook:${geofenceId}`
    }
}

function flattenIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return []
    const out: string[] = []
    for (const item of raw) {
        if (typeof item === 'string' && item.length > 0 && !/^\d+$/.test(item)) {
            out.push(item)
        } else if (Array.isArray(item)) {
            out.push(...flattenIds(item))
        }
    }
    return out
}

/** Approximate a geodesic circle as a closed GeoJSON Polygon (lng/lat order). */
function circleToGeoJsonPolygon(
    lat: number,
    lng: number,
    radiusM: number,
    steps = 64,
): string {
    const earthRadiusM = 6_371_008.8
    const lat1 = (lat * Math.PI) / 180
    const lng1 = (lng * Math.PI) / 180
    const angDist = Math.max(radiusM, 1) / earthRadiusM
    const ring: [number, number][] = []

    for (let i = 0; i <= steps; i++) {
        const bearing = (i / steps) * 2 * Math.PI
        const lat2 = Math.asin(
            Math.sin(lat1) * Math.cos(angDist) +
                Math.cos(lat1) * Math.sin(angDist) * Math.cos(bearing),
        )
        const lng2 =
            lng1 +
            Math.atan2(
                Math.sin(bearing) * Math.sin(angDist) * Math.cos(lat1),
                Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2),
            )
        ring.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI])
    }

    return JSON.stringify({
        type: 'Polygon',
        coordinates: [ring],
    })
}
