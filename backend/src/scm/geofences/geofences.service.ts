import {
    BadRequestException,
    Injectable,
    Logger,
    OnModuleInit,
} from '@nestjs/common'
import { GeofenceDetect, GeofenceKind, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { Tile38Service } from '../tile38/tile38.service'
import { TrackingGateway } from '../tracking/tracking.gateway'
import {
    assertFound,
    optionalBoolean,
    optionalNumber,
    optionalString,
    parsePagination,
    requireInt,
    requireNumber,
    requireString,
    type ListQuery,
    type PaginatedResult,
} from '../scm.utils'

type GeofenceBody = {
    code?: string
    name?: string
    kind?: GeofenceKind
    lat?: number
    lng?: number
    radiusM?: number
    color?: string | null
    active?: boolean
    notes?: string | null
}

const GEOFENCE_KINDS = new Set(Object.values(GeofenceKind))

/** Regional MM hubs — coords aligned with prisma/seed shipment origins. */
const SEED: Array<{
    code: string
    name: string
    kind: GeofenceKind
    lat: number
    lng: number
    radiusM: number
    color: string
    notes?: string
}> = [
    {
        code: 'HUB-LUZON',
        name: 'AGC Luzon Hub — Manila',
        kind: GeofenceKind.HUB,
        lat: 14.6085,
        lng: 120.9645,
        radiusM: 900,
        color: '#38bdf8',
        notes: 'North Harbor, Manila',
    },
    {
        code: 'HUB-VISAYAS',
        name: 'AGC Logistics Hub — Cebu',
        kind: GeofenceKind.HUB,
        lat: 10.3181,
        lng: 123.9054,
        radiusM: 900,
        color: '#34d399',
        notes: 'Cebu Business Park, Cebu City',
    },
    {
        code: 'HUB-MINDANAO',
        name: 'AGC Mindanao Hub — Davao',
        kind: GeofenceKind.HUB,
        lat: 7.0905,
        lng: 125.6082,
        radiusM: 900,
        color: '#fbbf24',
        notes: 'JP Laurel Ave, Davao City',
    },
    {
        code: 'CP-NORTH',
        name: 'North Checkpoint',
        kind: GeofenceKind.CHECKPOINT,
        lat: 14.65,
        lng: 121.02,
        radiusM: 450,
        color: '#a78bfa',
    },
]

@Injectable()
export class GeofencesService implements OnModuleInit {
    private readonly logger = new Logger(GeofencesService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly tile38: Tile38Service,
        private readonly trackingGateway: TrackingGateway,
    ) {}

    async onModuleInit() {
        try {
            let upserted = 0
            for (const row of SEED) {
                await this.prisma.geofence.upsert({
                    where: { code: row.code },
                    create: {
                        code: row.code,
                        name: row.name,
                        kind: row.kind,
                        lat: row.lat,
                        lng: row.lng,
                        radiusM: row.radiusM,
                        color: row.color,
                        notes: row.notes ?? null,
                        active: true,
                    },
                    update: {
                        name: row.name,
                        kind: row.kind,
                        lat: row.lat,
                        lng: row.lng,
                        radiusM: row.radiusM,
                        color: row.color,
                        notes: row.notes ?? null,
                    },
                })
                upserted += 1
            }
            this.logger.log(`Upserted ${upserted} default SCM geofences`)
            await this.resyncAllToTile38()
        } catch (err) {
            this.logger.warn(
                `Geofence bootstrap skipped: ${err instanceof Error ? err.message : String(err)}`,
            )
        }
    }

    async findAll(
        query: ListQuery & { kind?: string; active?: string },
    ): Promise<PaginatedResult<unknown>> {
        const { page, pageSize, skip } = parsePagination(query)
        const where: Prisma.GeofenceWhereInput = {}

        if (query.kind) {
            if (!GEOFENCE_KINDS.has(query.kind as GeofenceKind)) {
                throw new BadRequestException('Invalid geofence kind')
            }
            where.kind = query.kind as GeofenceKind
        }

        if (query.active === 'true') where.active = true
        if (query.active === 'false') where.active = false

        if (query.search?.trim()) {
            const q = query.search.trim()
            where.OR = [
                { code: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
            ]
        }

        const [data, total] = await this.prisma.$transaction([
            this.prisma.geofence.findMany({
                where,
                orderBy: { name: 'asc' },
                skip,
                take: pageSize,
            }),
            this.prisma.geofence.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return assertFound(
            await this.prisma.geofence.findUnique({ where: { id } }),
            'Geofence not found',
        )
    }

    async create(body: GeofenceBody) {
        const kind = body.kind ?? GeofenceKind.HUB
        if (!GEOFENCE_KINDS.has(kind)) {
            throw new BadRequestException('Invalid geofence kind')
        }

        const lat = requireNumber(body.lat, 'lat')
        const lng = requireNumber(body.lng, 'lng')
        const radiusM = requireInt(body.radiusM, 'radiusM')
        if (radiusM <= 0) {
            throw new BadRequestException('radiusM must be > 0')
        }

        const geofence = await this.prisma.geofence.create({
            data: {
                code: requireString(body.code, 'code'),
                name: requireString(body.name, 'name'),
                kind,
                lat,
                lng,
                radiusM,
                color: optionalString(body.color) ?? null,
                active: optionalBoolean(body.active) ?? true,
                notes: optionalString(body.notes) ?? null,
            },
        })

        await this.syncOneToTile38(geofence)
        return geofence
    }

    async update(id: string, body: GeofenceBody) {
        await this.findOne(id)
        const data: Prisma.GeofenceUpdateInput = {}

        if (body.code !== undefined) data.code = requireString(body.code, 'code')
        if (body.name !== undefined) data.name = requireString(body.name, 'name')
        if (body.kind !== undefined) {
            if (!GEOFENCE_KINDS.has(body.kind)) {
                throw new BadRequestException('Invalid geofence kind')
            }
            data.kind = body.kind
        }
        if (body.lat !== undefined) data.lat = requireNumber(body.lat, 'lat')
        if (body.lng !== undefined) data.lng = requireNumber(body.lng, 'lng')
        if (body.radiusM !== undefined) {
            const radiusM = requireInt(body.radiusM, 'radiusM')
            if (radiusM <= 0) {
                throw new BadRequestException('radiusM must be > 0')
            }
            data.radiusM = radiusM
        }
        if (body.color !== undefined) {
            data.color = optionalString(body.color) ?? null
        }
        if (body.active !== undefined) {
            data.active = optionalBoolean(body.active) ?? true
        }
        if (body.notes !== undefined) {
            data.notes = optionalString(body.notes) ?? null
        }

        const geofence = await this.prisma.geofence.update({
            where: { id },
            data,
        })

        if (geofence.active) {
            await this.syncOneToTile38(geofence)
        } else {
            await this.tile38.deleteGeofence(geofence.id)
        }

        return geofence
    }

    async remove(id: string) {
        await this.findOne(id)
        await this.tile38.deleteGeofence(id)
        await this.prisma.geofence.delete({ where: { id } })
        return { ok: true }
    }

    async listEvents(query: ListQuery & { geofenceId?: string; vehicleId?: string }) {
        const { page, pageSize, skip } = parsePagination(query)
        const where: Prisma.GeofenceEventWhereInput = {}
        if (query.geofenceId) where.geofenceId = query.geofenceId
        if (query.vehicleId) where.vehicleId = query.vehicleId

        const [data, total] = await this.prisma.$transaction([
            this.prisma.geofenceEvent.findMany({
                where,
                include: { geofence: true },
                orderBy: { detectedAt: 'desc' },
                skip,
                take: pageSize,
            }),
            this.prisma.geofenceEvent.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    /**
     * Tile38 webhook payload (enter/exit for NEARBY FENCE).
     * Also used when we record fallback INTERSECTS detections.
     */
    async handleTile38Hook(body: Record<string, unknown>) {
        const detectRaw = String(body.detect ?? '').toLowerCase()
        const detect =
            detectRaw === 'enter'
                ? GeofenceDetect.ENTER
                : detectRaw === 'exit'
                  ? GeofenceDetect.EXIT
                  : detectRaw === 'inside'
                    ? GeofenceDetect.INSIDE
                    : detectRaw === 'outside'
                      ? GeofenceDetect.OUTSIDE
                      : null

        if (!detect) {
            return { ignored: true, reason: 'unknown_detect' }
        }

        const vehicleId = String(body.id ?? '')
        if (!vehicleId) {
            return { ignored: true, reason: 'missing_vehicle' }
        }

        const hook = String(body.hook ?? '')
        const geofenceId = hook.startsWith('scm:hook:')
            ? hook.slice('scm:hook:'.length)
            : String(body.geofenceId ?? '')

        if (!geofenceId) {
            return { ignored: true, reason: 'missing_geofence' }
        }

        const coords = extractCoords(body.object)
        const latitude = coords?.lat ?? 0
        const longitude = coords?.lng ?? 0

        const geofence = await this.prisma.geofence.findUnique({
            where: { id: geofenceId },
        })
        if (!geofence || !geofence.active) {
            return { ignored: true, reason: 'geofence_inactive' }
        }

        const event = await this.prisma.geofenceEvent.create({
            data: {
                geofenceId,
                vehicleId,
                detect,
                latitude,
                longitude,
                rawPayload: body as Prisma.InputJsonValue,
            },
            include: { geofence: true },
        })

        this.trackingGateway.emitGeofenceEvent({
            id: event.id,
            geofenceId: event.geofenceId,
            geofenceCode: geofence.code,
            geofenceName: geofence.name,
            vehicleId: event.vehicleId,
            detect: event.detect,
            latitude: event.latitude,
            longitude: event.longitude,
            detectedAt: event.detectedAt.toISOString(),
        })

        return { ok: true, eventId: event.id }
    }

    /** After GPS SET on fleet, optionally emit enter events via INTERSECTS fallback */
    async detectIntersectsFallback(
        vehicleId: string,
        lat: number,
        lng: number,
    ) {
        const ids = await this.tile38.intersectsGeofences(lat, lng)
        for (const geofenceId of ids) {
            await this.handleTile38Hook({
                detect: 'inside',
                id: vehicleId,
                geofenceId,
                hook: this.tile38.hookName(geofenceId),
                object: {
                    type: 'Point',
                    coordinates: [lng, lat],
                },
                source: 'intersects_fallback',
            })
        }
    }

    private async syncOneToTile38(geofence: {
        id: string
        lat: number
        lng: number
        radiusM: number
        active: boolean
    }) {
        if (!geofence.active) {
            await this.tile38.deleteGeofence(geofence.id)
            return
        }
        await this.tile38.setGeofenceCircle(
            geofence.id,
            geofence.lat,
            geofence.lng,
            geofence.radiusM,
        )
        await this.tile38.syncNearbyHook(
            geofence.id,
            geofence.lat,
            geofence.lng,
            geofence.radiusM,
        )
    }

    private async resyncAllToTile38() {
        if (!this.tile38.isReady) return
        const active = await this.prisma.geofence.findMany({
            where: { active: true },
        })
        for (const fence of active) {
            await this.syncOneToTile38(fence)
        }
        this.logger.log(`Synced ${active.length} geofences to Tile38`)
    }
}

function extractCoords(object: unknown): { lat: number; lng: number } | null {
    if (!object || typeof object !== 'object') return null
    const coords = (object as { coordinates?: unknown }).coordinates
    if (!Array.isArray(coords) || coords.length < 2) return null
    const lng = Number(coords[0])
    const lat = Number(coords[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
}
