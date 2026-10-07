import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common'
import { StopStatus, TripStatus } from '@prisma/client'
import {
    parseDeliverOutcome,
    parseExecutionMeta,
    parseFailureReason,
    validateStopExecution,
    type StopAction,
} from './trip-execution.rules'

const stop = (id: string, sequence: number, status: StopStatus) => ({ id, sequence, status, name: null })

function trip(over: Partial<{ status: TripStatus; driverId: string | null; allowOutOfOrder: boolean }> = {}, stops = [
    stop('s1', 1, StopStatus.PENDING),
    stop('s2', 2, StopStatus.PENDING),
]) {
    return {
        status: TripStatus.IN_TRANSIT,
        driverId: 'drv-1',
        allowOutOfOrder: false,
        ...over,
        stops,
    }
}

const run = (t: ReturnType<typeof trip>, stopId: string, action: StopAction, caller: string | null = 'drv-1') =>
    validateStopExecution({ trip: t, stopId, action, callerDriverId: caller })

describe('validateStopExecution', () => {
    it.each([
        TripStatus.DRAFT,
        TripStatus.PLANNED,
        TripStatus.ASSIGNED,
        TripStatus.DISPATCHED,
        TripStatus.COMPLETED,
        TripStatus.CANCELLED,
    ])('rejects every stop action when trip is %s', (status) => {
        for (const action of ['ARRIVE', 'POD', 'COMPLETE', 'FAIL'] as StopAction[]) {
            expect(() => run(trip({ status }), 's1', action)).toThrow(ConflictException)
            expect(() => run(trip({ status }), 's1', action)).toThrow(/Start the trip/)
        }
    })

    it('rejects a missing or different driver', () => {
        expect(() => run(trip(), 's1', 'ARRIVE', null)).toThrow(ForbiddenException)
        expect(() => run(trip(), 's1', 'ARRIVE', 'drv-2')).toThrow(ForbiddenException)
        expect(() => run(trip({ driverId: null }), 's1', 'ARRIVE', 'drv-1')).toThrow(ForbiddenException)
    })

    it('rejects a stop that is not on the trip', () => {
        expect(() => run(trip(), 'nope', 'ARRIVE')).toThrow(NotFoundException)
    })

    it('PENDING can arrive but cannot be delivered, failed or get POD', () => {
        expect(run(trip(), 's1', 'ARRIVE').id).toBe('s1')
        for (const action of ['COMPLETE', 'FAIL', 'POD'] as StopAction[]) {
            expect(() => run(trip(), 's1', action)).toThrow(/Arrive at stop #1/)
        }
    })

    it('ARRIVED can complete / fail / POD but not arrive again', () => {
        const t = trip({}, [stop('s1', 1, StopStatus.ARRIVED), stop('s2', 2, StopStatus.PENDING)])
        expect(run(t, 's1', 'COMPLETE').id).toBe('s1')
        expect(run(t, 's1', 'FAIL').id).toBe('s1')
        expect(run(t, 's1', 'POD').id).toBe('s1')
        expect(() => run(t, 's1', 'ARRIVE')).toThrow(/only PENDING/)
    })

    it.each([StopStatus.COMPLETED, StopStatus.FAILED, StopStatus.SKIPPED])(
        '%s stops are immutable for the driver',
        (status) => {
            const t = trip({}, [stop('s1', 1, status)])
            for (const action of ['ARRIVE', 'POD', 'COMPLETE', 'FAIL'] as StopAction[]) {
                expect(() => run(t, 's1', action)).toThrow(/cannot be changed by the driver/)
            }
        },
    )

    it('blocks a later stop while an earlier one is open (allowOutOfOrder = false)', () => {
        expect(() => run(trip(), 's2', 'ARRIVE')).toThrow(/Finish stop #1 first/)
    })

    it('allows the next stop once earlier stops are terminal (FAILED counts)', () => {
        const t = trip({}, [stop('s1', 1, StopStatus.FAILED), stop('s2', 2, StopStatus.PENDING)])
        expect(run(t, 's2', 'ARRIVE').id).toBe('s2')
    })

    it('allows out-of-order execution when the dispatcher enabled it', () => {
        expect(run(trip({ allowOutOfOrder: true }), 's2', 'ARRIVE').id).toBe('s2')
    })
})

describe('parseFailureReason', () => {
    it('requires a code', () => {
        expect(() => parseFailureReason(undefined)).toThrow(BadRequestException)
        expect(() => parseFailureReason('')).toThrow(/reasonCode is required/)
    })
    it('rejects unknown codes and normalises case', () => {
        expect(() => parseFailureReason('LOST')).toThrow(/Invalid reasonCode/)
        expect(parseFailureReason('customer_refused')).toBe('CUSTOMER_REFUSED')
    })
})

describe('parseDeliverOutcome', () => {
    it('maps DELIVERED / COMPLETED / default to COMPLETE and FAILED to FAIL', () => {
        expect(parseDeliverOutcome(undefined)).toBe('COMPLETE')
        expect(parseDeliverOutcome('DELIVERED')).toBe('COMPLETE')
        expect(parseDeliverOutcome('COMPLETED')).toBe('COMPLETE')
        expect(parseDeliverOutcome('FAILED')).toBe('FAIL')
        expect(() => parseDeliverOutcome('SKIPPED')).toThrow(BadRequestException)
    })
})

describe('parseExecutionMeta', () => {
    const now = new Date('2026-10-03T08:00:00Z')
    it('defaults occurredAt to server time and leaves GPS empty', () => {
        expect(parseExecutionMeta({}, now)).toEqual({
            occurredAt: now,
            latitude: null,
            longitude: null,
            accuracyM: null,
            deviceId: null,
            clientActionId: null,
        })
    })
    it('accepts GPS + client time', () => {
        const meta = parseExecutionMeta(
            { latitude: 14.6, longitude: 121, accuracy: 12, deviceId: 'dev', clientOccurredAt: '2026-10-03T07:59:00Z', clientActionId: 'a1' },
            now,
        )
        expect(meta).toMatchObject({ latitude: 14.6, longitude: 121, accuracyM: 12, deviceId: 'dev', clientActionId: 'a1' })
        expect(meta.occurredAt.toISOString()).toBe('2026-10-03T07:59:00.000Z')
    })
    it('rejects half / out-of-range coordinates and future client time', () => {
        expect(() => parseExecutionMeta({ latitude: 14 }, now)).toThrow(/together/)
        expect(() => parseExecutionMeta({ latitude: 95, longitude: 0 }, now)).toThrow(/latitude/)
        expect(() => parseExecutionMeta({ latitude: 0, longitude: 190 }, now)).toThrow(/longitude/)
        expect(() => parseExecutionMeta({ clientOccurredAt: '2026-10-03T09:00:00Z' }, now)).toThrow(/future/)
    })
})
