import {
    BadRequestException,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    assertFound,
    haversineKm,
    optionalDate,
    optionalNumber,
    requireNumber,
    requireString,
} from '../scm.utils'
import { TrackingGateway } from './tracking.gateway'
import { Tile38Service } from '../tile38/tile38.service'
import {
    expandIngestBodies,
    flespiMessageHasTelematicsEvent,
    identLookupKeys,
    isFlespiMessage,
    mapFlespiMessageToIngest,
    type NormalizedGpsIngest,
} from './flespi-mapper'

type GpsPingBody = {
    vehicleId?: string
    tripId?: string | null
    latitude?: number
    longitude?: number
    speedKmh?: number
    heading?: number
    recordedAt?: string | Date
    rawPayload?: Record<string, unknown> | null
}

/**
 * Flat ingest fields after normalizing Traccar / flespi payloads.
 */
@Injectable()
export class TrackingService {
    private readonly logger = new Logger(TrackingService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly trackingGateway: TrackingGateway,
        private readonly tile38: Tile38Service,
    ) {}

    /**
     * Shared secret for HTTP GPS ingest (flespi stream / Traccar forward).
     * Accepts TRACKING_INGEST_TOKEN, FLESPI_INGEST_TOKEN, or TRACCAR_INGEST_TOKEN.
     * Headers: X-Traccar-Token | X-Flespi-Token | Authorization: Bearer
     */
    assertIngestAuth(headers: {
        traccarToken?: string
        flespiToken?: string
        authorization?: string
    }) {
        const expected = [
            process.env.TRACKING_INGEST_TOKEN,
            process.env.FLESPI_INGEST_TOKEN,
            process.env.TRACCAR_INGEST_TOKEN,
        ]
            .map((v) => v?.trim())
            .filter((v): v is string => Boolean(v))

        if (expected.length === 0) {
            throw new UnauthorizedException(
                'Set TRACKING_INGEST_TOKEN (or FLESPI_INGEST_TOKEN / TRACCAR_INGEST_TOKEN) on the API',
            )
        }

        const bearer = headers.authorization?.startsWith('Bearer ')
            ? headers.authorization.slice(7).trim()
            : null
        const provided =
            optionalTrim(headers.flespiToken) ||
            optionalTrim(headers.traccarToken) ||
            optionalTrim(bearer)

        if (!provided || !expected.includes(provided)) {
            throw new UnauthorizedException('Invalid or missing ingest token')
        }
    }

    async fleet(query: { status?: string; search?: string } = {}) {
        const where: Record<string, unknown> = {}

        if (query.status) {
            where.status = query.status
        }

        if (query.search?.trim()) {
            const q = query.search.trim()
            where.OR = [
                { code: { contains: q, mode: 'insensitive' } },
                { plateNumber: { contains: q, mode: 'insensitive' } },
                { make: { contains: q, mode: 'insensitive' } },
                { model: { contains: q, mode: 'insensitive' } },
                { telematicsDeviceId: { contains: q, mode: 'insensitive' } },
            ]
        }

        const vehicles = await this.prisma.vehicle.findMany({
            where,
            orderBy: { plateNumber: 'asc' },
            include: {
                gpsLogs: {
                    orderBy: { recordedAt: 'desc' },
                    take: 1,
                },
                trips: {
                    where: {
                        status: { in: ['IN_TRANSIT', 'ASSIGNED', 'PLANNED'] },
                    },
                    orderBy: [{ updatedAt: 'desc' }],
                    take: 5,
                    select: {
                        id: true,
                        code: true,
                        status: true,
                        stops: {
                            orderBy: { sequence: 'asc' },
                            select: {
                                id: true,
                                sequence: true,
                                name: true,
                                address: true,
                                lat: true,
                                lng: true,
                                status: true,
                                pinColor: true,
                            },
                        },
                    },
                },
            },
        })

        return {
            data: vehicles.map((vehicle) => {
                const { gpsLogs, trips, ...rest } = vehicle
                const activeTrip =
                    trips.find((trip) => trip.status === 'IN_TRANSIT') ??
                    trips.find((trip) => trip.status === 'ASSIGNED') ??
                    trips[0] ??
                    null

                return {
                    vehicle: rest,
                    latest: gpsLogs[0] ?? null,
                    activeTrip,
                }
            }),
            total: vehicles.length,
        }
    }

    async latest(vehicleId: string) {
        assertFound(
            await this.prisma.vehicle.findUnique({ where: { id: vehicleId } }),
            'Vehicle not found',
        )

        return (
            (await this.prisma.gpsLog.findFirst({
                where: { vehicleId },
                orderBy: { recordedAt: 'desc' },
            })) ?? null
        )
    }

    async history(
        vehicleId: string,
        query: { from?: string; to?: string; limit?: string },
    ) {
        assertFound(
            await this.prisma.vehicle.findUnique({ where: { id: vehicleId } }),
            'Vehicle not found',
        )

        const where: {
            vehicleId: string
            recordedAt?: { gte?: Date; lte?: Date }
        } = { vehicleId }

        const from = optionalDate(query.from)
        const to = optionalDate(query.to)
        if (from || to) {
            where.recordedAt = {}
            if (from) where.recordedAt.gte = from
            if (to) where.recordedAt.lte = to
        }

        const limit = Math.min(1000, Math.max(1, Number(query.limit) || 200))

        return this.prisma.gpsLog.findMany({
            where,
            orderBy: { recordedAt: 'desc' },
            take: limit,
        })
    }

    /** Explicit vehicleId ping (manual / internal). */
    async ping(body: GpsPingBody) {
        const vehicleId = requireString(body.vehicleId, 'vehicleId')
        const vehicle = assertFound(
            await this.prisma.vehicle.findUnique({ where: { id: vehicleId } }),
            'Vehicle not found',
        )

        return this.createGpsLog(vehicle, {
            tripId: body.tripId,
            latitude: requireNumber(body.latitude, 'latitude'),
            longitude: requireNumber(body.longitude, 'longitude'),
            speedKmh: optionalNumber(body.speedKmh) ?? 0,
            heading: optionalNumber(body.heading),
            recordedAt: optionalDate(body.recordedAt) ?? new Date(),
            rawPayload: body.rawPayload,
        })
    }

    /**
     * GPS ingest — flespi MQTT/HTTP stream, Traccar forward, or flat body.
     * Accepts a single message object or an array / `{ result|messages|data: [] }`.
     * Resolves Vehicle by telematicsDeviceId = flespi 14-digit ident (or IMEI).
     * Unknown devices are ignored (logged) so forwarders do not fail.
     */
    async ingest(body: unknown) {
        const messages = expandIngestBodies(body)
        if (messages.length === 0) {
            throw new BadRequestException('Empty GPS ingest body')
        }

        if (messages.length === 1) {
            return this.ingestOne(messages[0])
        }

        const results = []
        for (const message of messages) {
            results.push(await this.ingestOne(message))
        }
        return { count: results.length, results }
    }

    private async ingestOne(body: Record<string, unknown>) {
        const normalized: NormalizedGpsIngest = isFlespiMessage(body)
            ? mapFlespiMessageToIngest(body)
            : normalizeTraccarIngestBody(body)

        const deviceKey =
            optionalTrim(normalized.telematicsDeviceId) ||
            optionalTrim(normalized.uniqueId) ||
            optionalTrim(normalized.deviceId)

        let vehicle =
            deviceKey != null
                ? await this.findVehicleByTelematicsIdent(deviceKey)
                : null

        if (!vehicle && normalized.vehicleId) {
            vehicle = await this.prisma.vehicle.findUnique({
                where: { id: String(normalized.vehicleId) },
            })
        }

        if (!vehicle) {
            this.logger.warn(
                `Ignoring GPS ingest for unknown device: ${deviceKey ?? normalized.vehicleId ?? 'n/a'}`,
            )
            return {
                ignored: true,
                reason: 'unknown_device',
                telematicsDeviceId: deviceKey ?? null,
            }
        }

        let latitude = firstNumber(normalized.latitude)
        let longitude = firstNumber(normalized.longitude)

        if (normalized.skipNoFix || latitude == null || longitude == null) {
            const hasEvent = flespiMessageHasTelematicsEvent(body)
            if (!hasEvent) {
                return {
                    ignored: true,
                    reason: 'no_fix',
                    telematicsDeviceId: deviceKey ?? null,
                }
            }

            const last = await this.prisma.gpsLog.findFirst({
                where: { vehicleId: vehicle.id },
                orderBy: { recordedAt: 'desc' },
                select: { latitude: true, longitude: true },
            })
            if (!last) {
                return {
                    ignored: true,
                    reason: 'no_fix_no_history',
                    telematicsDeviceId: deviceKey ?? null,
                }
            }
            latitude = last.latitude
            longitude = last.longitude
        }

        let speedKmh = optionalNumber(normalized.speedKmh)
        if (speedKmh == null && normalized.speed != null) {
            const speed = requireNumber(normalized.speed, 'speed')
            speedKmh =
                normalized.speedUnit === 'kn' ? speed * 1.852 : speed
        }

        const heading =
            optionalNumber(normalized.heading) ??
            optionalNumber(normalized.course)

        const recordedAt =
            optionalDate(normalized.recordedAt) ??
            optionalDate(normalized.fixTime) ??
            optionalDate(normalized.deviceTime) ??
            new Date()

        const log = await this.createGpsLog(vehicle, {
            tripId: normalized.tripId,
            latitude,
            longitude,
            speedKmh: speedKmh ?? 0,
            heading,
            recordedAt,
            rawPayload: normalized.rawPayload ?? {
                source: normalized.source ?? 'ingest',
                deviceId: deviceKey,
            },
        })

        return { ignored: false, gpsLog: log, vehicleId: vehicle.id }
    }

    /**
     * Match Vehicle.telematicsDeviceId to flespi ident (14-digit) or full IMEI (15).
     */
    private async findVehicleByTelematicsIdent(ident: string) {
        const keys = identLookupKeys(ident)
        for (const key of keys) {
            const exact = await this.prisma.vehicle.findFirst({
                where: { telematicsDeviceId: key },
            })
            if (exact) return exact
        }

        const digits = ident.replace(/\D/g, '')
        if (digits.length === 14) {
            return this.prisma.vehicle.findFirst({
                where: { telematicsDeviceId: { startsWith: digits } },
            })
        }
        return null
    }

    private async createGpsLog(
        vehicle: {
            id: string
            plateNumber: string
            telematicsDeviceId: string | null
            odometerKm: number
        },
        input: {
            tripId?: string | null
            latitude: number
            longitude: number
            speedKmh: number
            heading?: number | null
            recordedAt: Date
            rawPayload?: Record<string, unknown> | null
        },
    ) {
        if (input.latitude < -90 || input.latitude > 90) {
            throw new BadRequestException('latitude out of range')
        }
        if (input.longitude < -180 || input.longitude > 180) {
            throw new BadRequestException('longitude out of range')
        }

        let tripId = input.tripId || null
        if (!tripId) {
            const activeTrip = await this.prisma.trip.findFirst({
                where: { vehicleId: vehicle.id, status: 'IN_TRANSIT' },
                select: { id: true },
            })
            tripId = activeTrip?.id ?? null
        } else {
            assertFound(
                await this.prisma.trip.findUnique({
                    where: { id: tripId },
                }),
                'Trip not found',
            )
        }

        const rawPayload =
            input.rawPayload && typeof input.rawPayload === 'object'
                ? (input.rawPayload as Prisma.InputJsonValue)
                : undefined

        const previous = await this.prisma.gpsLog.findFirst({
            where: { vehicleId: vehicle.id },
            orderBy: { recordedAt: 'desc' },
            select: { latitude: true, longitude: true, recordedAt: true },
        })

        const log = await this.prisma.gpsLog.create({
            data: {
                vehicleId: vehicle.id,
                tripId,
                latitude: input.latitude,
                longitude: input.longitude,
                speedKmh: input.speedKmh,
                heading: input.heading ?? null,
                rawPayload,
                recordedAt: input.recordedAt,
            },
        })

        await this.advanceRunningOdometer(vehicle, {
            latitude: input.latitude,
            longitude: input.longitude,
            recordedAt: input.recordedAt,
            previous,
            rawPayload: input.rawPayload,
        })

        const refreshed = await this.prisma.vehicle.findUnique({
            where: { id: vehicle.id },
            select: { odometerKm: true },
        })

        this.trackingGateway.emitVehiclePosition({
            vehicleId: vehicle.id,
            plateNumber: vehicle.plateNumber,
            telematicsDeviceId: vehicle.telematicsDeviceId,
            latitude: log.latitude,
            longitude: log.longitude,
            speedKmh: log.speedKmh,
            heading: log.heading,
            recordedAt: log.recordedAt.toISOString(),
            gpsLogId: log.id,
            odometerKm: refreshed?.odometerKm ?? vehicle.odometerKm,
        })

        // Tile38 live geofence: update fleet point (NEARBY FENCE hooks fire enter/exit)
        void this.tile38.setFleetPoint(vehicle.id, log.latitude, log.longitude)

        return log
    }

    /**
     * Advance vehicle.odometerKm from device reading or GPS segment distance.
     * Caps unrealistic jumps so a bad fix does not inflate the counter.
     */
    private async advanceRunningOdometer(
        vehicle: { id: string; odometerKm: number },
        input: {
            latitude: number
            longitude: number
            recordedAt: Date
            previous: {
                latitude: number
                longitude: number
                recordedAt: Date
            } | null
            rawPayload?: Record<string, unknown> | null
        },
    ) {
        const deviceOdo = extractDeviceOdometerKm(input.rawPayload)
        if (deviceOdo != null && deviceOdo > vehicle.odometerKm) {
            await this.prisma.vehicle.update({
                where: { id: vehicle.id },
                data: { odometerKm: deviceOdo },
            })
            return
        }

        if (!input.previous) return

        const deltaKm = haversineKm(
            input.previous.latitude,
            input.previous.longitude,
            input.latitude,
            input.longitude,
        )
        // Ignore teleport / cold-start jumps (> 25 km between consecutive fixes)
        if (deltaKm <= 0 || deltaKm > 25) return

        await this.prisma.vehicle.update({
            where: { id: vehicle.id },
            data: { odometerKm: { increment: deltaKm } },
        })
    }
}

function optionalTrim(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value)
    }
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed || null
}

function firstNumber(...values: unknown[]): number | null {
    for (const value of values) {
        if (value == null || value === '') continue
        const n = typeof value === 'number' ? value : Number(value)
        if (Number.isFinite(n)) return n
    }
    return null
}

/**
 * Flatten Traccar `forward.type=json` body:
 * `{ device: { uniqueId }, position: { latitude, longitude, speed (kn), course, fixTime, attributes } }`
 * Flat / legacy payloads pass through with lat/lng aliases normalized.
 */
function normalizeTraccarIngestBody(
    body: Record<string, unknown>,
): NormalizedGpsIngest {
    const position =
        body.position && typeof body.position === 'object'
            ? (body.position as Record<string, unknown>)
            : null
    const device =
        body.device && typeof body.device === 'object'
            ? (body.device as Record<string, unknown>)
            : null

    if (!position && !device) {
        return {
            telematicsDeviceId:
                optionalTrim(body.telematicsDeviceId) ?? undefined,
            uniqueId: optionalTrim(body.uniqueId) ?? undefined,
            deviceId: optionalTrim(body.deviceId) ?? undefined,
            vehicleId:
                body.vehicleId != null ? String(body.vehicleId) : undefined,
            tripId:
                body.tripId === null
                    ? null
                    : body.tripId != null
                      ? String(body.tripId)
                      : undefined,
            latitude:
                firstNumber(body.latitude, body.lat) ?? undefined,
            longitude:
                firstNumber(body.longitude, body.lng, body.lon) ??
                undefined,
            speedKmh: optionalNumber(body.speedKmh),
            speed: firstNumber(body.speed) ?? undefined,
            speedUnit: body.speedUnit as 'kmh' | 'kn' | undefined,
            heading: optionalNumber(body.heading) ?? undefined,
            course: firstNumber(body.course) ?? undefined,
            recordedAt: body.recordedAt as string | Date | undefined,
            fixTime: body.fixTime as string | Date | undefined,
            deviceTime: body.deviceTime as string | Date | undefined,
            rawPayload:
                body.rawPayload && typeof body.rawPayload === 'object'
                    ? (body.rawPayload as Record<string, unknown>)
                    : body,
            source: 'flat',
        }
    }

    const nestedSpeed = position != null && position.speed != null
    const uniqueId =
        optionalTrim(device?.uniqueId) ||
        optionalTrim(body.uniqueId) ||
        optionalTrim(body.telematicsDeviceId)

    return {
        telematicsDeviceId:
            optionalTrim(body.telematicsDeviceId) ?? undefined,
        uniqueId: uniqueId ?? undefined,
        deviceId: optionalTrim(body.deviceId) ?? undefined,
        vehicleId:
            body.vehicleId != null ? String(body.vehicleId) : undefined,
        tripId:
            body.tripId === null
                ? null
                : body.tripId != null
                  ? String(body.tripId)
                  : undefined,
        latitude:
            firstNumber(position?.latitude, body.latitude, body.lat) ??
            undefined,
        longitude:
            firstNumber(
                position?.longitude,
                body.longitude,
                body.lng,
                body.lon,
            ) ?? undefined,
        speedKmh: optionalNumber(body.speedKmh),
        speed: firstNumber(position?.speed, body.speed) ?? undefined,
        // Traccar Position.speed is knots when nested
        speedUnit: nestedSpeed
            ? 'kn'
            : ((body.speedUnit as 'kmh' | 'kn' | undefined) ?? undefined),
        course:
            firstNumber(position?.course, body.course, body.heading) ??
            undefined,
        heading: optionalNumber(body.heading) ?? undefined,
        fixTime: (position?.fixTime ?? body.fixTime) as
            | string
            | Date
            | undefined,
        deviceTime: (position?.deviceTime ?? body.deviceTime) as
            | string
            | Date
            | undefined,
        recordedAt: body.recordedAt as string | Date | undefined,
        rawPayload:
            body.rawPayload && typeof body.rawPayload === 'object'
                ? (body.rawPayload as Record<string, unknown>)
                : body,
        source: 'traccar',
    }
}

/** Traccar-style attributes: odometer / totalDistance (often meters). */
function extractDeviceOdometerKm(
    rawPayload: Record<string, unknown> | null | undefined,
): number | null {
    if (!rawPayload || typeof rawPayload !== 'object') return null

    const position =
        rawPayload.position && typeof rawPayload.position === 'object'
            ? (rawPayload.position as Record<string, unknown>)
            : null

    const attrsCandidates: Array<Record<string, unknown>> = []
    if (position?.attributes && typeof position.attributes === 'object') {
        attrsCandidates.push(
            position.attributes as Record<string, unknown>,
        )
    }
    if (rawPayload.attributes && typeof rawPayload.attributes === 'object') {
        attrsCandidates.push(
            rawPayload.attributes as Record<string, unknown>,
        )
    }
    attrsCandidates.push(rawPayload)

    for (const attrs of attrsCandidates) {
        const direct = firstNumber(
            attrs.odometerKm,
            attrs.odometer,
            attrs.odo,
        )
        if (direct != null) {
            // Values > 1e6 are almost certainly meters
            return direct > 1_000_000 ? direct / 1000 : direct
        }

        const totalDistance = firstNumber(attrs.totalDistance)
        if (totalDistance != null) {
            return totalDistance / 1000
        }
    }

    return null
}
