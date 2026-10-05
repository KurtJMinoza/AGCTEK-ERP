import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { LoadPlanStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { GeocodeService } from '../geocode/geocode.service'
import { OsrmService } from '../routing/osrm.service'
import { computeHaversineLegs } from '../routing/haversine-route'
import { assertFound, optionalDate } from '../scm.utils'
import { loadPlanInclude, toStopSource } from './tms-load-plans.service'
import { applyStopOrder, buildTripStops, stopKey, type StopDraft, type TmsStopType } from './tms.rules'
import {
    computeSchedule,
    recommendDeparture,
    type DepartureMode,
    type ScheduleLeg,
    type ScheduleStop,
    type ScheduledStop,
} from './route-schedule'

const DEFAULT_SERVICE_MIN = 30
const MAX_GEOCODE_LOOKUPS = 10
const GEOCODE_TIMEOUT_MS = 5000

const ROUTE_TYPE: Record<TmsStopType, 'PICKUP' | 'SHIP_TO' | 'RETURN_TO'> = {
    SHIP: 'PICKUP',
    TO: 'SHIP_TO',
    RETURN: 'RETURN_TO',
}

type CoordSource = 'cargo' | 'geocoded' | null

type ResolvedStop = StopDraft & {
    key: string
    coordSource: CoordSource
}

export type RoutePreviewViolation = {
    code: 'LATE' | 'WINDOW_CONFLICT' | 'MISSING_COORDS' | 'DEPARTURE_IN_PAST'
    message: string
    stopKey?: string
    sequence?: number
    lateBySec?: number
}

function validCoords(lat: number | null, lng: number | null): boolean {
    return (
        lat != null &&
        lng != null &&
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180 &&
        !(lat === 0 && lng === 0)
    )
}

/**
 * Stateless route preview for one READY load plan (cargo-first).
 * Stops come only from that load's lines; nothing is persisted.
 * Geometry (OSRM / haversine) and schedule math live in separate units.
 */
@Injectable()
export class TmsRoutePreviewService {
    private readonly logger = new Logger(TmsRoutePreviewService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly osrm: OsrmService,
        private readonly geocode: GeocodeService,
    ) {}

    async preview(
        loadPlanId: string,
        body: {
            stopOrder?: unknown
            departAt?: unknown
            serviceTimeMin?: unknown
            departureMode?: unknown
        },
    ) {
        const plan = assertFound(
            await this.prisma.loadPlan.findUnique({
                where: { id: loadPlanId },
                include: loadPlanInclude,
            }),
            'Load plan not found',
        )
        if (plan.status !== LoadPlanStatus.READY) {
            throw new BadRequestException(
                `Route preview is only available for READY load plans (${plan.code} is ${plan.status})`,
            )
        }
        if (plan.lines.length === 0) {
            throw new BadRequestException('Load plan has no cargo lines')
        }

        const built = buildTripStops(plan.lines.map((l) => toStopSource(l.id, l.shipmentLine)))
        if (built.errors.length > 0) {
            throw new BadRequestException(built.errors.join('; '))
        }

        const stopOrder = parseStopOrder(body.stopOrder)
        const ordered = applyStopOrder(built.stops, stopOrder)
        if (ordered.error) throw new BadRequestException(ordered.error)

        const serviceTimeMin = parseServiceMinutes(body.serviceTimeMin)
        const departureMode = parseDepartureMode(body.departureMode)
        const departAtOverride = optionalDate(body.departAt) ?? null

        const stops = await this.resolveCoordinates(ordered.stops)
        const missing = stops.filter((s) => s.coordSource == null)
        const pickupCount = stops.filter((s) => s.stopType === 'SHIP').length
        const base = {
            loadPlanId: plan.id,
            loadPlanCode: plan.code,
            vehicle: { id: plan.vehicle.id, code: plan.vehicle.code, plateNumber: plan.vehicle.plateNumber },
            pickupCount,
            serviceTimeMin,
            departureMode,
            generatedAt: new Date().toISOString(),
        }

        if (missing.length > 0) {
            return {
                ...base,
                routable: false,
                router: null,
                routerFallbackReason: null,
                origin: originOf(stops, null),
                recommendedDeparture: null,
                departAt: null,
                arrivalAt: null,
                stops: stops.map((s) => toStopResponse(s, serviceTimeMin, null, null)),
                polyline: [],
                legDurationsSec: [],
                legDistancesM: [],
                totalDistanceM: null,
                totalDurationSec: null,
                tripDurationSec: null,
                feasible: false,
                violations: missing.map<RoutePreviewViolation>((s) => ({
                    code: 'MISSING_COORDS',
                    stopKey: s.key,
                    sequence: s.sequence,
                    message: `${s.name} (${s.address}) has no coordinates and could not be geocoded`,
                })),
            }
        }

        // OSRM first; any failure → haversine. The chosen router supplies BOTH the
        // polyline and the leg durations used for ETAs — never mix sources.
        const coords = stops.map((s) => ({ lat: s.lat as number, lng: s.lng as number }))
        const osrm = await this.osrm.getRoute(coords)
        const route = osrm ?? computeHaversineLegs(coords)
        const router: 'osrm' | 'haversine' = osrm ? 'osrm' : 'haversine'
        const routerFallbackReason = osrm
            ? null
            : this.osrm.baseUrl
              ? 'OSRM unavailable (timeout, HTTP or routing error) — estimated with haversine'
              : 'OSRM_BASE_URL is not configured — estimated with haversine'
        const legs: ScheduleLeg[] = route.legDurationsSec.map((durationSec, i) => ({
            durationSec,
            distanceM: route.legDistancesM[i],
        }))

        const scheduleStops: ScheduleStop[] = stops.map((s) => ({
            key: s.key,
            stopType: s.stopType,
            windowStart: s.windowStart,
            windowEnd: s.windowEnd,
            serviceSec: s.stopType === 'RETURN' ? 0 : serviceTimeMin * 60,
        }))
        const now = new Date()
        const recommendation = recommendDeparture(scheduleStops, legs, now, departureMode)
        const departAt = departAtOverride ?? recommendation.at
        const schedule = computeSchedule(scheduleStops, legs, departAt)

        const violations: RoutePreviewViolation[] = []
        if (departAt.getTime() < now.getTime() - 60_000) {
            violations.push({
                code: 'DEPARTURE_IN_PAST',
                message: 'Departure time is in the past',
            })
        }
        for (const key of recommendation.conflictKeys) {
            const stop = stops.find((s) => s.key === key)!
            violations.push({
                code: 'WINDOW_CONFLICT',
                stopKey: key,
                sequence: stop.sequence,
                message: `${stop.name}: window opens too late for later deliveries`,
            })
        }
        schedule.forEach((entry, index) => {
            if (entry.windowStatus !== 'LATE') return
            const stop = stops[index]
            violations.push({
                code: 'LATE',
                stopKey: stop.key,
                sequence: stop.sequence,
                lateBySec: entry.lateBySec,
                message: `${stop.name} finishes service ${Math.ceil(entry.lateBySec / 60)} min after its window closes`,
            })
        })

        const last = schedule[schedule.length - 1]
        const arrivalAt = last.arrivalAt ?? last.departureAt

        return {
            ...base,
            routable: true,
            router,
            routerFallbackReason,
            origin: originOf(stops, recommendation.at),
            recommendedDeparture: {
                at: recommendation.at.toISOString(),
                feasible: recommendation.feasible,
                basis: recommendation.basis,
                reason: recommendation.reason,
            },
            departAt: departAt.toISOString(),
            arrivalAt: arrivalAt?.toISOString() ?? null,
            stops: stops.map((s, i) =>
                toStopResponse(s, serviceTimeMin, schedule[i], i > 0 ? legs[i - 1] : null),
            ),
            polyline: route.polyline,
            legDurationsSec: route.legDurationsSec,
            legDistancesM: route.legDistancesM,
            totalDistanceM: route.totalDistanceM,
            totalDurationSec: route.totalDurationSec,
            tripDurationSec: arrivalAt
                ? Math.round((arrivalAt.getTime() - departAt.getTime()) / 1000)
                : null,
            feasible: violations.length === 0,
            violations,
        }
    }

    /** Use cargo lat/lng snapshot; otherwise geocode the stop address (not persisted). */
    private async resolveCoordinates(stops: StopDraft[]): Promise<ResolvedStop[]> {
        const geocodeEnabled = process.env.ROUTE_PREVIEW_GEOCODE !== 'false'
        const cache = new Map<string, { lat: number; lng: number } | null>()
        let lookups = 0
        const resolved: ResolvedStop[] = []

        for (const stop of stops) {
            const key = stopKey(stop)
            if (validCoords(stop.lat, stop.lng)) {
                resolved.push({ ...stop, key, coordSource: 'cargo' })
                continue
            }
            const address = stop.address?.trim()
            let hit: { lat: number; lng: number } | null = null
            if (geocodeEnabled && address) {
                if (cache.has(address)) {
                    hit = cache.get(address) ?? null
                } else if (lookups < MAX_GEOCODE_LOOKUPS) {
                    lookups++
                    try {
                        const [first] = await this.geocode.search(address, 1, GEOCODE_TIMEOUT_MS)
                        hit = first ? { lat: first.lat, lng: first.lng } : null
                    } catch (err) {
                        this.logger.warn(
                            `Geocode failed for "${address}": ${err instanceof Error ? err.message : String(err)}`,
                        )
                    }
                    cache.set(address, hit)
                }
            }
            resolved.push(
                hit
                    ? { ...stop, key, lat: hit.lat, lng: hit.lng, coordSource: 'geocoded' }
                    : { ...stop, key, lat: null, lng: null, coordSource: null },
            )
        }
        return resolved
    }
}

function parseStopOrder(value: unknown): string[] | null {
    if (value == null) return null
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        throw new BadRequestException('stopOrder must be an array of stop keys')
    }
    return value as string[]
}

function parseServiceMinutes(value: unknown): number {
    const fallback = Number(process.env.ROUTE_DEFAULT_SERVICE_MIN) || DEFAULT_SERVICE_MIN
    if (value == null || value === '') return fallback
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0 || n > 480) {
        throw new BadRequestException('serviceTimeMin must be between 0 and 480')
    }
    return n
}

function parseDepartureMode(value: unknown): DepartureMode {
    if (value == null || value === '') return 'ON_TIME'
    if (value === 'ON_TIME' || value === 'EARLY') return value
    throw new BadRequestException('departureMode must be ON_TIME or EARLY')
}

function originOf(stops: ResolvedStop[], recommendedAt: Date | null) {
    const pickup = stops[0]
    return {
        key: pickup.key,
        label: pickup.name,
        address: pickup.address,
        lat: pickup.lat,
        lng: pickup.lng,
        departAtRecommended: recommendedAt?.toISOString() ?? null,
    }
}

function toStopResponse(
    stop: ResolvedStop,
    serviceTimeMin: number,
    scheduled: ScheduledStop | null,
    leg: ScheduleLeg | null,
) {
    return {
        key: stop.key,
        sequence: stop.sequence,
        type: ROUTE_TYPE[stop.stopType],
        stopType: stop.stopType,
        label: stop.name,
        address: stop.address,
        warehouseId: stop.warehouseId,
        lat: stop.lat,
        lng: stop.lng,
        coordSource: stop.coordSource,
        missingCoords: stop.coordSource == null,
        shipmentIds: stop.shipmentIds,
        lineCount: stop.lines.length,
        windowStart: stop.windowStart?.toISOString() ?? null,
        windowEnd: stop.windowEnd?.toISOString() ?? null,
        serviceTimeSec: stop.stopType === 'RETURN' ? 0 : serviceTimeMin * 60,
        legDistanceM: leg?.distanceM ?? null,
        legDurationSec: leg?.durationSec ?? null,
        etaAt: scheduled?.arrivalAt?.toISOString() ?? null,
        waitingTimeSec: scheduled?.waitSec ?? 0,
        serviceStartAt: scheduled?.serviceStartAt?.toISOString() ?? null,
        departureAt: scheduled?.departureAt?.toISOString() ?? null,
        windowStatus: scheduled?.windowStatus ?? null,
        lateBySec: scheduled?.lateBySec ?? 0,
    }
}
