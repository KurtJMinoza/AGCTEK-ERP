import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Prisma, StopStatus, TripStatus, TripStopType } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { computeHaversineLegs } from '../routing/haversine-route'
import { OsrmService } from '../routing/osrm.service'
import { parseDepartureMode, parseServiceMinutes } from '../tms/route-preview.params'
import {
    computeSchedule,
    latestFeasibleDeparture,
    recommendDeparture,
    type ScheduleLeg,
    type ScheduleStop,
} from '../tms/route-schedule'
import { VehiclesService } from '../vehicles/vehicles.service'
import { optionalDate, optionalString, requireString } from '../scm.utils'
import { OCULAR_EVENTS, type OcularLeadCapturedEvent } from './ocular-trip.events'
import { isPickupStop, pickupsPrecedeDropoffs } from './ocular-stops.rules'
import { TripsService } from './trips.service'

const TERMINAL_STOP: ReadonlySet<StopStatus> = new Set([
    StopStatus.COMPLETED,
    StopStatus.FAILED,
    StopStatus.SKIPPED,
])
/** Trip statuses where the plan can still change. */
const EDITABLE_TRIP: ReadonlySet<TripStatus> = new Set([
    TripStatus.PLANNED,
    TripStatus.READY,
    TripStatus.DISPATCHED,
    TripStatus.ASSIGNED,
    TripStatus.IN_TRANSIT,
])
/** Stop moves a field user can make (PENDING is the start state). */
const STOP_ACTIONS = ['ARRIVED', 'COMPLETED', 'SKIPPED'] as const
type StopAction = (typeof STOP_ACTIONS)[number]

/** PICKUP = loaded / collected before the trip leaves; DROPOFF = the visit (default). */
export type OcularStopKind = 'PICKUP' | 'DROPOFF'

export type OcularStopInput = {
    type?: string
    address?: string
    lat?: number | string | null
    lng?: number | string | null
    name?: string | null
    notes?: string | null
    existingLeadId?: string | null
    customerId?: string | null
}

/** Key of the virtual return leg in the schedule (never a real stop id). */
const RETURN_KEY = '__return'

/** `returnToOrigin` query flag: on unless explicitly false / 0. */
function parseReturnToOrigin(value: unknown): boolean {
    if (value == null || value === '') return true
    const v = String(value).toLowerCase()
    if (v === 'true' || v === '1') return true
    if (v === 'false' || v === '0') return false
    throw new BadRequestException('returnToOrigin must be true or false')
}

function stopKind(value: unknown): OcularStopKind {
    if (value === undefined || value === null || value === '') return 'DROPOFF'
    const kind = String(value).toUpperCase()
    if (kind !== 'PICKUP' && kind !== 'DROPOFF') {
        throw new BadRequestException('type must be PICKUP or DROPOFF')
    }
    return kind
}

/**
 * Ocular runs: one Trip (purpose OCULAR) = one vehicle + ordered stops (manual order).
 * No load plan, shipments, sales order or goods issue. Live position is the vehicle's Flespi
 * device through the normal GpsLog pipeline. Leads are captured by CRM (`source = OCULAR`);
 * CRM tells SCM which lead came from which stop through an event.
 */
@Injectable()
export class OcularTripsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly vehicles: VehiclesService,
        private readonly trips: TripsService,
        private readonly osrm: OsrmService,
    ) {}

    /** New run: vehicle must be free for the whole window. Stops can be added right away. */
    async create(body: {
        vehicleId?: string
        driverId?: string | null
        windowStart?: string
        windowEnd?: string
        notes?: string | null
        stops?: OcularStopInput[]
    }) {
        const vehicleId = requireString(body.vehicleId, 'vehicleId')
        const from = optionalDate(body.windowStart)
        const to = optionalDate(body.windowEnd)
        if (!from || !to) throw new BadRequestException('windowStart and windowEnd are required')
        if (to.getTime() <= from.getTime()) {
            throw new BadRequestException('windowEnd must be after windowStart')
        }
        await this.assertVehicleFree(vehicleId, from, to)
        if (body.driverId) {
            const driver = await this.prisma.driver.findUnique({ where: { id: body.driverId } })
            if (!driver) throw new NotFoundException('Driver not found')
        }

        // Pickup points always come first; the given order is kept within each group.
        const stops = [...(body.stops ?? [])].sort(
            (a, b) =>
                Number(stopKind(b.type) === 'PICKUP') - Number(stopKind(a.type) === 'PICKUP'),
        )
        const stopRows = []
        for (const [index, stop] of stops.entries()) {
            stopRows.push(await this.stopData(stop, index + 1))
        }

        const code = `OCU-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random()
            .toString(36)
            .slice(2, 6)
            .toUpperCase()}`
        const trip = await this.prisma.trip.create({
            data: {
                code,
                vehicleId,
                driverId: body.driverId || null,
                status: TripStatus.PLANNED,
                purpose: 'OCULAR',
                loadPlanId: null,
                plannedStartAt: from,
                plannedEndAt: to,
                notes: optionalString(body.notes) ?? null,
                stops: { create: stopRows },
            },
            select: { id: true },
        })
        return this.trips.findOne(trip.id)
    }

    /** Change window / vehicle / driver / notes while the run is still editable. */
    async update(
        tripId: string,
        body: {
            vehicleId?: string
            driverId?: string | null
            windowStart?: string
            windowEnd?: string
            notes?: string | null
        },
    ) {
        const trip = await this.loadEditableTrip(tripId)
        const from = optionalDate(body.windowStart) ?? trip.plannedStartAt
        const to = optionalDate(body.windowEnd) ?? trip.plannedEndAt
        const vehicleId = body.vehicleId ?? trip.vehicleId
        if (!from || !to || to.getTime() <= from.getTime()) {
            throw new BadRequestException('windowEnd must be after windowStart')
        }
        if (!vehicleId) throw new BadRequestException('vehicleId is required')
        if (
            vehicleId !== trip.vehicleId ||
            from.getTime() !== trip.plannedStartAt?.getTime() ||
            to.getTime() !== trip.plannedEndAt?.getTime()
        ) {
            await this.assertVehicleFree(vehicleId, from, to, trip.id)
        }
        if (body.driverId) {
            const driver = await this.prisma.driver.findUnique({ where: { id: body.driverId } })
            if (!driver) throw new NotFoundException('Driver not found')
        }
        await this.prisma.trip.update({
            where: { id: tripId },
            data: {
                vehicleId,
                plannedStartAt: from,
                plannedEndAt: to,
                ...(body.driverId !== undefined ? { driverId: body.driverId || null } : {}),
                ...(body.notes !== undefined ? { notes: optionalString(body.notes) ?? null } : {}),
            },
        })
        return this.trips.findOne(tripId)
    }

    /** Dropoffs are appended; a pickup goes after the last pickup, ahead of every dropoff. */
    async addStop(tripId: string, body: OcularStopInput) {
        const trip = await this.loadEditableTrip(tripId)
        const pickup = stopKind(body.type) === 'PICKUP'
        if (pickup && trip.status === TripStatus.IN_TRANSIT) {
            throw new ConflictException('Pickup points can only be added before the trip starts')
        }
        const sequence = (trip.stops.at(-1)?.sequence ?? 0) + 1
        const data = await this.stopData(body, sequence)
        if (!pickup) {
            await this.prisma.tripStop.create({ data: { tripId, ...data } })
            return this.trips.findOne(tripId)
        }
        await this.prisma.$transaction(async (tx) => {
            const created = await tx.tripStop.create({ data: { tripId, ...data } })
            const ordered = [
                ...trip.stops.filter((s) => isPickupStop(s)),
                created,
                ...trip.stops.filter((s) => !isPickupStop(s)),
            ]
            await this.resequence(tx, tripId, ordered.map((s) => s.id))
        })
        return this.trips.findOne(tripId)
    }

    /** Edit a not-yet-finished stop (address / pin / notes / known lead or customer). */
    async updateStop(tripId: string, stopId: string, body: OcularStopInput) {
        const trip = await this.loadEditableTrip(tripId)
        const stop = trip.stops.find((s) => s.id === stopId)
        if (!stop) throw new NotFoundException('Stop not found')
        if (TERMINAL_STOP.has(stop.status) && body.address !== undefined) {
            throw new ConflictException(`Stop #${stop.sequence} is ${stop.status}`)
        }

        const data: Record<string, unknown> = {}
        if (body.address !== undefined) {
            data.address = requireString(body.address, 'address')
        }
        if (body.lat !== undefined || body.lng !== undefined) {
            const { lat, lng } = this.coords(body.lat, body.lng)
            data.lat = lat
            data.lng = lng
        }
        if (body.name !== undefined) data.name = optionalString(body.name)?.slice(0, 120) ?? null
        if (body.notes !== undefined) data.notes = optionalString(body.notes) ?? null
        if (body.existingLeadId !== undefined) {
            data.existingLeadId = await this.checkedLeadId(body.existingLeadId)
        }
        if (body.customerId !== undefined) {
            data.customerId = await this.checkedCustomerId(body.customerId)
        }
        await this.prisma.tripStop.update({ where: { id: stopId }, data })
        return this.trips.findOne(tripId)
    }

    /** Dispatcher order: `stopIds` must list every stop of the trip exactly once. */
    async reorderStops(tripId: string, body: { stopIds?: unknown }) {
        const trip = await this.loadEditableTrip(tripId)
        if (!Array.isArray(body.stopIds) || body.stopIds.some((s) => typeof s !== 'string')) {
            throw new BadRequestException('stopIds must be an array of stop ids')
        }
        const stopIds = body.stopIds as string[]
        const current = new Set(trip.stops.map((s) => s.id))
        if (
            stopIds.length !== current.size ||
            new Set(stopIds).size !== stopIds.length ||
            stopIds.some((id) => !current.has(id))
        ) {
            throw new BadRequestException('stopIds must list every stop of the trip exactly once')
        }
        const byId = new Map(trip.stops.map((s) => [s.id, s]))
        if (!pickupsPrecedeDropoffs(stopIds.map((id) => byId.get(id)!))) {
            throw new BadRequestException('Pickup points must come before dropoff points')
        }

        await this.prisma.$transaction((tx) => this.resequence(tx, tripId, stopIds))
        return this.trips.findOne(tripId)
    }

    /** Drop a pending stop that has not produced a lead. */
    async removeStop(tripId: string, stopId: string) {
        const trip = await this.loadEditableTrip(tripId)
        const stop = trip.stops.find((s) => s.id === stopId)
        if (!stop) throw new NotFoundException('Stop not found')
        if (stop.status !== StopStatus.PENDING) {
            throw new ConflictException(`Stop #${stop.sequence} is ${stop.status} and cannot be removed`)
        }
        if (stop.createdLeadId) {
            throw new ConflictException('A lead was captured at this stop; skip it instead of removing')
        }
        const remaining = trip.stops.filter((s) => s.id !== stopId)
        await this.prisma.$transaction(async (tx) => {
            await tx.tripStop.delete({ where: { id: stopId } })
            await this.resequence(
                tx,
                tripId,
                remaining.map((s) => s.id),
            )
        })
        return this.trips.findOne(tripId)
    }

    /**
     * Field progress on a stop: ARRIVED, COMPLETED (done) or SKIPPED, with optional outcome
     * notes. Dropoffs need a started trip; pickups are marked done before it starts (and gate the
     * start). No lead is ever forced: a skipped or empty dropoff is fine. When every stop of a
     * running trip is finished the trip completes.
     */
    async setStopStatus(
        tripId: string,
        stopId: string,
        body: { status?: string; notes?: string | null },
    ) {
        const trip = await this.loadEditableTrip(tripId)
        const stop = trip.stops.find((s) => s.id === stopId)
        if (!stop) throw new NotFoundException('Stop not found')
        const pickup = isPickupStop(stop)
        // Pickups are worked before departure; dropoffs only once the trip is running.
        if (!pickup && trip.status !== TripStatus.IN_TRANSIT) {
            throw new ConflictException('Start the trip before updating stops')
        }
        const action = body.status as StopAction
        if (!STOP_ACTIONS.includes(action)) {
            throw new BadRequestException(`status must be one of ${STOP_ACTIONS.join(', ')}`)
        }
        if (pickup && action === 'SKIPPED') {
            throw new BadRequestException('A pickup point cannot be skipped; remove it instead')
        }
        if (TERMINAL_STOP.has(stop.status)) {
            throw new ConflictException(`Stop #${stop.sequence} is already ${stop.status}`)
        }
        if (action === 'ARRIVED' && stop.status === StopStatus.ARRIVED) {
            throw new ConflictException(`Stop #${stop.sequence} is already ARRIVED`)
        }

        const now = new Date()
        await this.prisma.tripStop.update({
            where: { id: stopId },
            data: {
                status: action as StopStatus,
                ...(action === 'ARRIVED' ? { arrivedAt: now } : {}),
                ...(action === 'COMPLETED'
                    ? { arrivedAt: stop.arrivedAt ?? now, completedAt: now }
                    : {}),
                ...(action === 'SKIPPED' ? { completedAt: now } : {}),
                ...(body.notes !== undefined ? { notes: optionalString(body.notes) ?? null } : {}),
            },
        })
        await this.completeTripWhenDone(tripId)
        return this.trips.findOne(tripId)
    }

    /** CRM created a lead at a stop: remember it on the stop (first lead wins; retries are no-ops). */
    @OnEvent(OCULAR_EVENTS.LEAD_CAPTURED, { suppressErrors: false })
    async onLeadCaptured(event: OcularLeadCapturedEvent) {
        await this.prisma.tripStop.updateMany({
            where: { id: event.tripStopId, createdLeadId: null },
            data: { createdLeadId: event.leadId },
        })
    }

    /**
     * Read-only route preview: the stops that have a map position, in the dispatcher's manual
     * order (pickups first). Geometry comes from the same router as delivery previews (OSRM,
     * haversine fallback) and the timing uses the same schedule algorithm: per-stop ETA with
     * waiting and visit time, window status, the latest / earliest feasible start
     * (ON_TIME / EARLY) and violations. The trip window end is the deadline for every visit
     * (a stop's own window wins when it has one). The run starts at the first stop at
     * `departAt` (default: the actual start, else the planned window start). Nothing is saved.
     */
    async routePreview(
        tripId: string,
        query: {
            departAt?: unknown
            departureMode?: unknown
            serviceTimeMin?: unknown
            returnToOrigin?: unknown
        } = {},
    ) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                stops: { orderBy: { sequence: 'asc' } },
                vehicle: { select: { id: true, code: true, plateNumber: true } },
            },
        })
        if (!trip) throw new NotFoundException('Trip not found')
        if (trip.purpose !== 'OCULAR') throw new BadRequestException('Not an ocular trip')

        const serviceTimeMin = parseServiceMinutes(query.serviceTimeMin)
        const departureMode = parseDepartureMode(query.departureMode)
        const departAtOverride = optionalDate(query.departAt) ?? null

        const located = trip.stops.filter((s) => s.lat != null && s.lng != null)
        const stopCoords = located.map((s) => ({ lat: s.lat as number, lng: s.lng as number }))

        // Optional empty return to the first pickup (preview only, like the delivery trip's RETURN
        // stop): the vehicle's base for this run. Needs a located pickup plus at least one more stop.
        const origin = located.length >= 2 && isPickupStop(located[0]) ? located[0] : null
        const wantsReturn = parseReturnToOrigin(query.returnToOrigin)
        const returnToOrigin = origin != null && wantsReturn
        const coords = returnToOrigin ? [...stopCoords, stopCoords[0]] : stopCoords

        let route: {
            polyline: [number, number][]
            legDurationsSec: number[]
            legDistancesM: number[]
            totalDistanceM: number
            totalDurationSec: number
        } | null = null
        let router: 'osrm' | 'haversine' | null = null
        let routerFallbackReason: string | null = null
        if (coords.length >= 2) {
            const osrm = await this.osrm.getRoute(coords)
            route = osrm ?? computeHaversineLegs(coords)
            router = osrm ? 'osrm' : 'haversine'
            routerFallbackReason = osrm
                ? null
                : this.osrm.baseUrl
                  ? 'OSRM unavailable (timeout, HTTP or routing error) — estimated with haversine'
                  : 'OSRM_BASE_URL is not configured — estimated with haversine'
        }

        // The schedule algorithm needs a start node: the run begins at the first stop, so a
        // zero-length leg from a virtual start (not returned) lets the first stop get its own
        // arrival, visit time and window check.
        const serviceSec = serviceTimeMin * 60
        const scheduleStops: ScheduleStop[] = [
            { key: '__start', stopType: 'SHIP', windowStart: null, windowEnd: null, serviceSec: 0 },
            ...located.map<ScheduleStop>((s) => ({
                key: s.id,
                stopType: isPickupStop(s) ? 'SHIP' : 'TO',
                windowStart: s.windowStart ?? null,
                windowEnd: s.windowEnd ?? trip.plannedEndAt ?? null,
                serviceSec,
            })),
            // No window and no visit time: it only adds the drive back to the schedule.
            ...(returnToOrigin
                ? [
                      {
                          key: RETURN_KEY,
                          stopType: 'RETURN' as const,
                          windowStart: null,
                          windowEnd: null,
                          serviceSec: 0,
                      },
                  ]
                : []),
        ]
        const legs: ScheduleLeg[] = [
            { durationSec: 0, distanceM: 0 },
            ...(route
                ? route.legDurationsSec.map((durationSec, i) => ({
                      durationSec,
                      distanceM: route!.legDistancesM[i],
                  }))
                : []),
        ]

        const now = new Date()
        const planning =
            trip.status !== TripStatus.IN_TRANSIT &&
            trip.status !== TripStatus.COMPLETED &&
            trip.status !== TripStatus.CANCELLED
        const scheduled = located.length > 0

        const rec = scheduled && planning ? recommendDeparture(scheduleStops, legs, now, departureMode) : null
        const departAt = scheduled
            ? (departAtOverride ?? trip.startedAt ?? trip.plannedStartAt ?? rec?.at ?? now)
            : null
        const schedule = scheduled && departAt ? computeSchedule(scheduleStops, legs, departAt) : []

        const violations: Array<{
            code: 'LATE' | 'WINDOW_CONFLICT' | 'DEPARTURE_IN_PAST'
            message: string
            stopId?: string
            sequence?: number
            lateBySec?: number
        }> = []
        if (scheduled && departAt) {
            if (planning && departAt.getTime() < now.getTime() - 60_000) {
                violations.push({ code: 'DEPARTURE_IN_PAST', message: 'Start time is in the past' })
            }
            for (const key of latestFeasibleDeparture(scheduleStops, legs).conflictKeys) {
                const stop = located.find((s) => s.id === key)
                if (!stop) continue
                violations.push({
                    code: 'WINDOW_CONFLICT',
                    stopId: key,
                    sequence: stop.sequence,
                    message: `${stop.name ?? 'Stop #' + stop.sequence}: window opens too late for later stops`,
                })
            }
            schedule.forEach((entry, index) => {
                if (index === 0 || entry.windowStatus !== 'LATE') return
                const stop = located[index - 1]
                if (!stop) return
                const own = stop.windowEnd != null
                violations.push({
                    code: 'LATE',
                    stopId: stop.id,
                    sequence: stop.sequence,
                    lateBySec: entry.lateBySec,
                    message: `${stop.name ?? 'Stop #' + stop.sequence} finishes ${Math.ceil(entry.lateBySec / 60)} min after ${own ? 'its window closes' : 'the trip window ends'}`,
                })
            })
        }

        const timing = new Map(located.map((s, i) => [s.id, { entry: schedule[i + 1], index: i }]))
        const last = schedule.length > 0 ? schedule[schedule.length - 1] : null
        // Back at the first pickup when the return leg is on, else when the last visit is done.
        const arrivalAt = last ? (returnToOrigin ? last.arrivalAt : last.departureAt) : null
        const returnLegIndex = located.length - 1
        const returnStop =
            returnToOrigin && origin && last && route
                ? {
                      label: origin.name ?? 'Pickup point',
                      address: origin.address,
                      lat: origin.lat,
                      lng: origin.lng,
                      legDistanceM: route.legDistancesM[returnLegIndex] ?? null,
                      legDurationSec: route.legDurationsSec[returnLegIndex] ?? null,
                      etaAt: last.arrivalAt?.toISOString() ?? null,
                  }
                : null

        return {
            tripId: trip.id,
            tripCode: trip.code,
            status: trip.status,
            vehicle: trip.vehicle,
            serviceTimeMin,
            departureMode,
            generatedAt: now.toISOString(),
            routable: route != null,
            router,
            routerFallbackReason,
            recommendedDeparture: rec
                ? {
                      at: rec.at.toISOString(),
                      feasible: rec.feasible,
                      basis: rec.basis,
                      reason: rec.feasible
                          ? null
                          : rec.conflictKeys.length > 0
                            ? 'Stop windows conflict with travel and visit time — no start meets them all'
                            : 'The latest start that finishes inside the trip window has already passed',
                  }
                : null,
            departAt: departAt?.toISOString() ?? null,
            arrivalAt: arrivalAt?.toISOString() ?? null,
            returnToOrigin,
            returnStop,
            tripDurationSec:
                departAt && arrivalAt
                    ? Math.round((arrivalAt.getTime() - departAt.getTime()) / 1000)
                    : null,
            feasible: scheduled && violations.length === 0,
            violations,
            stops: trip.stops.map((s) => {
                const missingCoords = s.lat == null || s.lng == null
                const t = timing.get(s.id)
                const entry = t?.entry
                const legIndex = t ? t.index - 1 : -1
                return {
                    id: s.id,
                    sequence: s.sequence,
                    kind: (isPickupStop(s) ? 'PICKUP' : 'DROPOFF') as OcularStopKind,
                    label: s.name ?? (isPickupStop(s) ? 'Pickup point' : 'Ocular visit'),
                    address: s.address,
                    lat: s.lat,
                    lng: s.lng,
                    status: s.status,
                    missingCoords,
                    legDistanceM: route && legIndex >= 0 ? route.legDistancesM[legIndex] : null,
                    legDurationSec: route && legIndex >= 0 ? route.legDurationsSec[legIndex] : null,
                    windowStart: s.windowStart?.toISOString() ?? null,
                    windowEnd: (s.windowEnd ?? trip.plannedEndAt)?.toISOString() ?? null,
                    etaAt: entry?.arrivalAt?.toISOString() ?? null,
                    waitingTimeSec: entry?.waitSec ?? 0,
                    serviceStartAt: entry?.serviceStartAt?.toISOString() ?? null,
                    departureAt: entry?.departureAt?.toISOString() ?? null,
                    windowStatus: entry?.windowStatus ?? null,
                    lateBySec: entry?.lateBySec ?? 0,
                }
            }),
            polyline: route?.polyline ?? [],
            totalDistanceM: route?.totalDistanceM ?? null,
            totalDurationSec: route?.totalDurationSec ?? null,
            missingCoordsCount: trip.stops.length - located.length,
        }
    }

    private async completeTripWhenDone(tripId: string) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            select: { status: true, stops: { select: { status: true } } },
        })
        // Only a running trip completes; pickups marked done before departure must not close it.
        if (!trip || trip.status !== TripStatus.IN_TRANSIT) return
        if (trip.stops.length > 0 && trip.stops.every((s) => TERMINAL_STOP.has(s.status))) {
            await this.trips.updateStatus(tripId, TripStatus.COMPLETED)
        }
    }

    /** Two-phase update keeps @@unique([tripId, sequence]) satisfied. */
    private async resequence(tx: Prisma.TransactionClient, tripId: string, orderedIds: string[]) {
        await tx.tripStop.updateMany({
            where: { tripId },
            data: { sequence: { increment: 10000 } },
        })
        for (const [index, stopId] of orderedIds.entries()) {
            await tx.tripStop.update({ where: { id: stopId }, data: { sequence: index + 1 } })
        }
    }

    private async loadEditableTrip(tripId: string) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: { stops: { orderBy: { sequence: 'asc' } } },
        })
        if (!trip) throw new NotFoundException('Trip not found')
        if (trip.purpose !== 'OCULAR') throw new BadRequestException('Not an ocular trip')
        if (!EDITABLE_TRIP.has(trip.status)) {
            throw new ConflictException(`Trip is ${trip.status} and cannot be changed`)
        }
        return trip
    }

    private async assertVehicleFree(vehicleId: string, from: Date, to: Date, excludeTripId?: string) {
        const vehicle = await this.vehicles.findOne(vehicleId)
        if (this.vehicles.isBlockedFromRouting(vehicle)) {
            throw new BadRequestException('Vehicle is blocked from routing (maintenance or inactive status)')
        }
        const free = await this.vehicles.availableVehicles(from, to, excludeTripId)
        if (!free.some((v) => v.id === vehicleId)) {
            throw new ConflictException('Vehicle is not available for the selected window')
        }
    }

    private coords(latInput: unknown, lngInput: unknown) {
        const has = (v: unknown) => v !== null && v !== undefined && v !== ''
        if (!has(latInput) && !has(lngInput)) return { lat: null, lng: null }
        if (!has(latInput) || !has(lngInput)) {
            throw new BadRequestException('lat and lng must be given together')
        }
        const lat = Number(latInput)
        const lng = Number(lngInput)
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
            throw new BadRequestException('lat must be between -90 and 90')
        }
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
            throw new BadRequestException('lng must be between -180 and 180')
        }
        return { lat, lng }
    }

    /** Read-only existence checks: CRM / SD own these records, SCM only stores the reference. */
    private async checkedLeadId(id: string | null | undefined) {
        if (!id) return null
        const lead = await this.prisma.crmLead.findUnique({ where: { id }, select: { id: true } })
        if (!lead) throw new BadRequestException('Lead not found')
        return lead.id
    }

    private async checkedCustomerId(id: string | null | undefined) {
        if (!id) return null
        const customer = await this.prisma.sdCustomer.findUnique({ where: { id }, select: { id: true } })
        if (!customer) throw new BadRequestException('Customer not found')
        return customer.id
    }

    private async stopData(input: OcularStopInput, sequence: number) {
        const { lat, lng } = this.coords(input.lat, input.lng)
        return {
            sequence,
            name: optionalString(input.name)?.slice(0, 120) ?? null,
            address: requireString(input.address, 'address'),
            lat,
            lng,
            status: StopStatus.PENDING,
            stopType: stopKind(input.type) === 'PICKUP' ? TripStopType.SHIP : TripStopType.TO,
            notes: optionalString(input.notes) ?? null,
            existingLeadId: await this.checkedLeadId(input.existingLeadId),
            customerId: await this.checkedCustomerId(input.customerId),
        }
    }
}
