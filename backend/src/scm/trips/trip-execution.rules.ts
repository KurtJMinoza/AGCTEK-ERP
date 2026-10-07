import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common'
import { DeliveryFailureReason, StopStatus, TripStatus } from '@prisma/client'
import { optionalDate, optionalNumber, optionalString } from '../scm.utils'

/**
 * Trip execution rules (driver arrive / POD / deliver / fail). Pure — no I/O.
 *
 *   PENDING --arrive--> ARRIVED --deliver--> COMPLETED
 *                               --fail-----> FAILED
 */
export type StopAction = 'ARRIVE' | 'POD' | 'COMPLETE' | 'FAIL'

export const TERMINAL_STOP_STATUSES: readonly StopStatus[] = [
    StopStatus.COMPLETED,
    StopStatus.FAILED,
    StopStatus.SKIPPED,
]

const REQUIRED_STOP_STATUS: Record<StopAction, StopStatus> = {
    ARRIVE: StopStatus.PENDING,
    POD: StopStatus.ARRIVED,
    COMPLETE: StopStatus.ARRIVED,
    FAIL: StopStatus.ARRIVED,
}

const ACTION_VERB: Record<StopAction, string> = {
    ARRIVE: 'arriving',
    POD: 'capturing proof of delivery',
    COMPLETE: 'completing it',
    FAIL: 'marking it failed',
}

/** Client may report the action time up to this far ahead of the server clock. */
const MAX_CLIENT_CLOCK_SKEW_MS = 5 * 60 * 1000

export const FAILURE_REASONS = Object.values(DeliveryFailureReason)

type ExecTrip<S extends ExecStop = ExecStop> = {
    status: TripStatus
    driverId: string | null
    allowOutOfOrder: boolean
    stops: S[]
}

type ExecStop = {
    id: string
    sequence: number
    status: StopStatus
    name?: string | null
}

export function isTerminalStop(status: StopStatus) {
    return TERMINAL_STOP_STATUSES.includes(status)
}

/** Existing authz equivalent: the driver app sends its driver id (`x-driver-id`). */
export function assertAssignedDriver(
    trip: { driverId: string | null },
    callerDriverId: string | null | undefined,
) {
    const caller = callerDriverId?.trim()
    if (!caller) {
        throw new ForbiddenException('Driver identity (x-driver-id) is required to execute a trip')
    }
    if (!trip.driverId || trip.driverId !== caller) {
        throw new ForbiddenException('Only the driver assigned to this trip can execute it')
    }
}

export function assertTripInTransit(status: TripStatus) {
    if (status !== TripStatus.IN_TRANSIT) {
        throw new ConflictException(
            `Start the trip to begin execution (trip is ${status})`,
        )
    }
}

export function assertStopTransition(stop: ExecStop, action: StopAction) {
    if (isTerminalStop(stop.status)) {
        throw new ConflictException(
            `Stop #${stop.sequence} is already ${stop.status} and cannot be changed by the driver`,
        )
    }
    const required = REQUIRED_STOP_STATUS[action]
    if (stop.status === required) return
    if (action === 'ARRIVE') {
        throw new ConflictException(
            `Stop #${stop.sequence} is ${stop.status} — only PENDING stops can be arrived at`,
        )
    }
    throw new ConflictException(
        `Arrive at stop #${stop.sequence} before ${ACTION_VERB[action]}`,
    )
}

export function assertStopSequence(
    stops: ExecStop[],
    target: ExecStop,
    allowOutOfOrder: boolean,
) {
    if (allowOutOfOrder) return
    const blocking = stops
        .filter((s) => s.sequence < target.sequence && !isTerminalStop(s.status))
        .sort((a, b) => a.sequence - b.sequence)[0]
    if (blocking) {
        throw new ConflictException(
            `Finish stop #${blocking.sequence}${blocking.name ? ` (${blocking.name})` : ''} first — stops must be done in order`,
        )
    }
}

/**
 * Central guard for every driver stop mutation, in order:
 * assigned driver → trip IN_TRANSIT → stop on trip → valid transition → sequence.
 */
export function validateStopExecution<S extends ExecStop>(input: {
    trip: ExecTrip<S>
    stopId: string
    action: StopAction
    callerDriverId: string | null | undefined
}): S {
    const { trip, stopId, action } = input
    assertAssignedDriver(trip, input.callerDriverId)
    assertTripInTransit(trip.status)
    const stop = trip.stops.find((s) => s.id === stopId)
    if (!stop) throw new NotFoundException('Stop not found on this trip')
    assertStopTransition(stop, action)
    assertStopSequence(trip.stops, stop, trip.allowOutOfOrder)
    return stop
}

export type ExecutionMeta = {
    occurredAt: Date
    latitude: number | null
    longitude: number | null
    accuracyM: number | null
    deviceId: string | null
    clientActionId: string | null
}

/** Optional client metadata on arrive / deliver / fail (GPS best-effort). */
export function parseExecutionMeta(
    body: Record<string, unknown> | null | undefined,
    now: Date = new Date(),
): ExecutionMeta {
    const b = body ?? {}
    const latitude = optionalNumber(b.latitude) ?? null
    const longitude = optionalNumber(b.longitude) ?? null
    if ((latitude == null) !== (longitude == null)) {
        throw new BadRequestException('latitude and longitude must be sent together')
    }
    if (latitude != null && (latitude < -90 || latitude > 90)) {
        throw new BadRequestException('latitude must be between -90 and 90')
    }
    if (longitude != null && (longitude < -180 || longitude > 180)) {
        throw new BadRequestException('longitude must be between -180 and 180')
    }
    const accuracyM = optionalNumber(b.accuracy) ?? null
    if (accuracyM != null && accuracyM < 0) {
        throw new BadRequestException('accuracy must be >= 0')
    }
    const occurredAt = optionalDate(b.clientOccurredAt) ?? now
    if (occurredAt.getTime() - now.getTime() > MAX_CLIENT_CLOCK_SKEW_MS) {
        throw new BadRequestException('clientOccurredAt cannot be in the future')
    }
    const clientActionId = optionalString(b.clientActionId) ?? null
    if (clientActionId && clientActionId.length > 100) {
        throw new BadRequestException('clientActionId must be at most 100 characters')
    }
    return {
        occurredAt,
        latitude,
        longitude,
        accuracyM,
        deviceId: optionalString(b.deviceId) ?? null,
        clientActionId,
    }
}

export function parseFailureReason(value: unknown): DeliveryFailureReason {
    const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
    if (!code) {
        throw new BadRequestException(
            `reasonCode is required when a stop fails (${FAILURE_REASONS.join(', ')})`,
        )
    }
    if (!FAILURE_REASONS.includes(code as DeliveryFailureReason)) {
        throw new BadRequestException(
            `Invalid reasonCode "${code}" — expected one of ${FAILURE_REASONS.join(', ')}`,
        )
    }
    return code as DeliveryFailureReason
}

/** Deliver payload `outcome`: DELIVERED (default) / COMPLETED → COMPLETE, FAILED → FAIL. */
export function parseDeliverOutcome(value: unknown): 'COMPLETE' | 'FAIL' {
    if (value == null || value === '') return 'COMPLETE'
    const v = typeof value === 'string' ? value.trim().toUpperCase() : ''
    if (v === 'DELIVERED' || v === 'COMPLETED') return 'COMPLETE'
    if (v === 'FAILED') return 'FAIL'
    throw new BadRequestException('outcome must be DELIVERED or FAILED')
}
