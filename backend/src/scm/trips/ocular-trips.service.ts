import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { StopStatus, TripStatus, TripStopType } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { VehiclesService } from '../vehicles/vehicles.service'
import { optionalDate, optionalString, requireString } from '../scm.utils'
import { OCULAR_EVENTS, type OcularLeadCapturedEvent } from './ocular-trip.events'
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

export type OcularStopInput = {
    address?: string
    lat?: number | string | null
    lng?: number | string | null
    name?: string | null
    notes?: string | null
    existingLeadId?: string | null
    customerId?: string | null
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

        const stops = body.stops ?? []
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

    async addStop(tripId: string, body: OcularStopInput) {
        const trip = await this.loadEditableTrip(tripId)
        const sequence = (trip.stops.at(-1)?.sequence ?? 0) + 1
        const data = await this.stopData(body, sequence)
        await this.prisma.tripStop.create({ data: { tripId, ...data } })
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

        await this.prisma.$transaction(async (tx) => {
            // two-phase update keeps @@unique([tripId, sequence]) satisfied
            await tx.tripStop.updateMany({
                where: { tripId },
                data: { sequence: { increment: 10000 } },
            })
            for (const [index, stopId] of stopIds.entries()) {
                await tx.tripStop.update({ where: { id: stopId }, data: { sequence: index + 1 } })
            }
        })
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
            await tx.tripStop.updateMany({
                where: { tripId },
                data: { sequence: { increment: 10000 } },
            })
            for (const [index, s] of remaining.entries()) {
                await tx.tripStop.update({ where: { id: s.id }, data: { sequence: index + 1 } })
            }
        })
        return this.trips.findOne(tripId)
    }

    /**
     * Field progress on a stop: ARRIVED, COMPLETED (done) or SKIPPED, with optional outcome
     * notes. The trip must be started. No lead is ever forced: a skipped or empty stop is fine.
     * When every stop is finished the trip completes.
     */
    async setStopStatus(
        tripId: string,
        stopId: string,
        body: { status?: string; notes?: string | null },
    ) {
        const trip = await this.loadEditableTrip(tripId)
        if (trip.status !== TripStatus.IN_TRANSIT) {
            throw new ConflictException('Start the trip before updating stops')
        }
        const stop = trip.stops.find((s) => s.id === stopId)
        if (!stop) throw new NotFoundException('Stop not found')
        const action = body.status as StopAction
        if (!STOP_ACTIONS.includes(action)) {
            throw new BadRequestException(`status must be one of ${STOP_ACTIONS.join(', ')}`)
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

    private async completeTripWhenDone(tripId: string) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            select: { status: true, stops: { select: { status: true } } },
        })
        if (!trip || trip.status === TripStatus.COMPLETED || trip.status === TripStatus.CANCELLED) {
            return
        }
        if (trip.stops.length > 0 && trip.stops.every((s) => TERMINAL_STOP.has(s.status))) {
            await this.trips.updateStatus(tripId, TripStatus.COMPLETED)
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
            stopType: TripStopType.TO,
            notes: optionalString(input.notes) ?? null,
            existingLeadId: await this.checkedLeadId(input.existingLeadId),
            customerId: await this.checkedCustomerId(input.customerId),
        }
    }
}
