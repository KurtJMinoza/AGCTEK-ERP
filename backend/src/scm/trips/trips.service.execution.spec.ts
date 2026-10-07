import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { Prisma, ShipmentStatus, StopStatus, TripStatus } from '@prisma/client'
import { TripsService } from './trips.service'

type Link = { action: string; shipmentId: string }
type FakeStop = Record<string, unknown> & { id: string; sequence: number; status: StopStatus; links: Link[] }
type State = {
    trip: { id: string; status: TripStatus; driverId: string | null; allowOutOfOrder: boolean; loadPlanId: null }
    stops: FakeStop[]
    shipments: Record<string, Record<string, unknown> & { status: ShipmentStatus }>
    events: Array<Record<string, unknown>>
    failEventWrite: boolean
}

function setup(stops: Array<[string, number, StopStatus, Link[]]>, tripOver: Partial<State['trip']> = {}) {
    const state: State = {
        trip: { id: 't1', status: TripStatus.IN_TRANSIT, driverId: 'drv-1', allowOutOfOrder: false, loadPlanId: null, ...tripOver },
        stops: stops.map(([id, sequence, status, links]) => ({ id, sequence, status, name: null, links })),
        shipments: {
            shA: { status: ShipmentStatus.IN_TRANSIT },
            shB: { status: ShipmentStatus.IN_TRANSIT },
        },
        events: [],
        failEventWrite: false,
    }
    const assign = (target: Record<string, unknown>, data: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(data)) if (v !== undefined) target[k] = v
    }
    const prisma = {
        trip: {
            findUnique: async () => ({
                ...state.trip,
                stops: [...state.stops]
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((s) => ({ ...s, shipments: s.links })),
            }),
        },
        tripStop: {
            findFirst: async ({ where }: { where: { id: string } }) => state.stops.find((s) => s.id === where.id) ?? null,
            update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
                assign(state.stops.find((s) => s.id === where.id)!, data)
            },
            updateMany: async ({ where, data }: { where: { id: string; status: StopStatus }; data: Record<string, unknown> }) => {
                const s = state.stops.find((x) => x.id === where.id && x.status === where.status)
                if (!s) return { count: 0 }
                assign(s, data)
                return { count: 1 }
            },
        },
        tripStopEvent: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
                if (state.failEventWrite) throw new Error('event write failed')
                if (data.clientActionId && state.events.some((e) => e.clientActionId === data.clientActionId)) {
                    throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' })
                }
                state.events.push(data)
            },
            findUnique: async ({ where }: { where: { clientActionId: string } }) =>
                state.events.find((e) => e.clientActionId === where.clientActionId) ?? null,
        },
        shipment: {
            updateMany: async ({ where, data }: { where: { id: { in: string[] }; status: { notIn: ShipmentStatus[] } }; data: Record<string, unknown> }) => {
                let count = 0
                for (const id of where.id.in) {
                    const sh = state.shipments[id]
                    if (sh && !where.status.notIn.includes(sh.status)) {
                        assign(sh, data)
                        count++
                    }
                }
                return { count }
            },
        },
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
            const snapshot = structuredClone({ stops: state.stops, shipments: state.shipments, events: state.events })
            try {
                return await fn(prisma)
            } catch (err) {
                Object.assign(state, snapshot)
                throw err
            }
        },
    }
    const service = new TripsService(prisma as never, {} as never, {} as never, {} as never)
    const completeTrip = jest.spyOn(service, 'updateStatus').mockResolvedValue({} as never)
    const stop = (id: string) => state.stops.find((s) => s.id === id)!
    return { state, service, completeTrip, stop }
}

const TWO_STOPS: Array<[string, number, StopStatus, Link[]]> = [
    ['s1', 1, StopStatus.PENDING, [{ action: 'DROPOFF', shipmentId: 'shA' }]],
    ['s2', 2, StopStatus.PENDING, [{ action: 'DROPOFF', shipmentId: 'shB' }]],
]

describe('TripsService stop execution', () => {
    it('arrive: PENDING → ARRIVED and records an ARRIVED event with GPS', async () => {
        const { service, state, stop } = setup(TWO_STOPS)
        await service.arriveStop('t1', 's1', 'drv-1', { latitude: 14.6, longitude: 121, accuracy: 8, deviceId: 'phone-1' })
        expect(stop('s1').status).toBe(StopStatus.ARRIVED)
        expect(stop('s1').arrivedAt).toBeInstanceOf(Date)
        expect(state.events).toHaveLength(1)
        expect(state.events[0]).toMatchObject({
            tripId: 't1', stopId: 's1', eventType: 'ARRIVED', driverId: 'drv-1',
            latitude: 14.6, longitude: 121, accuracyM: 8, deviceId: 'phone-1',
        })
    })

    it('rejects execution when the trip is not IN_TRANSIT', async () => {
        const { service, state } = setup(TWO_STOPS, { status: TripStatus.DISPATCHED })
        await expect(service.arriveStop('t1', 's1', 'drv-1')).rejects.toThrow(/Start the trip/)
        await expect(service.deliverStop('t1', 's1', {}, 'drv-1')).rejects.toThrow(ConflictException)
        expect(state.events).toHaveLength(0)
    })

    it('rejects the wrong driver', async () => {
        const { service } = setup(TWO_STOPS)
        await expect(service.arriveStop('t1', 's1', 'drv-2')).rejects.toThrow(ForbiddenException)
        await expect(service.startTrip('t1', undefined)).rejects.toThrow(ForbiddenException)
    })

    it('deliver from PENDING is rejected', async () => {
        const { service, stop } = setup(TWO_STOPS)
        await expect(service.deliverStop('t1', 's1', { outcome: 'DELIVERED' }, 'drv-1')).rejects.toThrow(/Arrive at stop #1/)
        expect(stop('s1').status).toBe(StopStatus.PENDING)
    })

    it('deliver: ARRIVED → COMPLETED, DROPOFF shipment DELIVERED, COMPLETED event', async () => {
        const { service, state, stop, completeTrip } = setup(TWO_STOPS)
        await service.arriveStop('t1', 's1', 'drv-1')
        await service.deliverStop('t1', 's1', { outcome: 'DELIVERED', podNotes: 'left at gate' }, 'drv-1')
        expect(stop('s1').status).toBe(StopStatus.COMPLETED)
        expect(state.shipments.shA.status).toBe(ShipmentStatus.DELIVERED)
        expect(state.events.map((e) => e.eventType)).toEqual(['ARRIVED', 'COMPLETED'])
        expect(state.events[1].notes).toBe('left at gate')
        expect(completeTrip).not.toHaveBeenCalled()
    })

    it('fail: stores reason, holds linked shipment, and the trip continues', async () => {
        const { service, state, stop, completeTrip } = setup(TWO_STOPS)
        await service.arriveStop('t1', 's1', 'drv-1')
        await service.deliverStop('t1', 's1', { outcome: 'FAILED', reasonCode: 'CUSTOMER_UNAVAILABLE', failureReason: 'gate locked' }, 'drv-1')
        expect(stop('s1')).toMatchObject({ status: 'FAILED', failureCode: 'CUSTOMER_UNAVAILABLE', failureReason: 'gate locked' })
        expect(stop('s1').failedAt).toBeInstanceOf(Date)
        expect(state.shipments.shA).toMatchObject({ status: 'EXCEPTION_HOLD', exceptionCode: 'CUSTOMER_UNAVAILABLE', exceptionNote: 'gate locked' })
        expect(state.shipments.shB.status).toBe(ShipmentStatus.IN_TRANSIT)
        expect(state.events[1]).toMatchObject({ eventType: 'FAILED', reasonCode: 'CUSTOMER_UNAVAILABLE' })
        expect(completeTrip).not.toHaveBeenCalled()
        await service.arriveStop('t1', 's2', 'drv-1')
        expect(stop('s2').status).toBe(StopStatus.ARRIVED)
    })

    it('fail without reasonCode (or OTHER without a note) is rejected with no change', async () => {
        const { service, state, stop } = setup(TWO_STOPS)
        await service.arriveStop('t1', 's1', 'drv-1')
        await expect(service.deliverStop('t1', 's1', { outcome: 'FAILED', failureReason: 'x' }, 'drv-1')).rejects.toThrow(BadRequestException)
        await expect(service.deliverStop('t1', 's1', { outcome: 'FAILED', reasonCode: 'OTHER' }, 'drv-1')).rejects.toThrow(/OTHER/)
        expect(stop('s1').status).toBe(StopStatus.ARRIVED)
        expect(state.events).toHaveLength(1)
    })

    it('terminal stops cannot be changed again', async () => {
        const { service } = setup([['s1', 1, StopStatus.COMPLETED, []]])
        await expect(service.deliverStop('t1', 's1', { outcome: 'FAILED', reasonCode: 'OTHER', failureReason: 'x' }, 'drv-1')).rejects.toThrow(/cannot be changed/)
        await expect(service.saveStopPod('t1', 's1', { podNotes: 'edit' }, 'drv-1')).rejects.toThrow(/cannot be changed/)
    })

    it('sequence: stop 2 is blocked until stop 1 is terminal unless allowOutOfOrder', async () => {
        await expect(setup(TWO_STOPS).service.arriveStop('t1', 's2', 'drv-1')).rejects.toThrow(/Finish stop #1 first/)
        const { service, stop } = setup(TWO_STOPS, { allowOutOfOrder: true })
        await service.arriveStop('t1', 's2', 'drv-1')
        expect(stop('s2').status).toBe(StopStatus.ARRIVED)
    })

    it('stop change and event commit together — an event failure rolls back the stop', async () => {
        const { service, state, stop } = setup(TWO_STOPS)
        state.failEventWrite = true
        await expect(service.arriveStop('t1', 's1', 'drv-1')).rejects.toThrow('event write failed')
        expect(stop('s1').status).toBe(StopStatus.PENDING)
        expect(state.events).toHaveLength(0)
    })

    it('clientActionId replay is a no-op; reuse for another action conflicts', async () => {
        const { service, state } = setup(TWO_STOPS)
        await service.arriveStop('t1', 's1', 'drv-1', { clientActionId: 'act-1' })
        await service.arriveStop('t1', 's1', 'drv-1', { clientActionId: 'act-1' })
        expect(state.events).toHaveLength(1)
        await expect(
            service.deliverStop('t1', 's1', { outcome: 'DELIVERED', clientActionId: 'act-1' }, 'drv-1'),
        ).rejects.toThrow(/different stop action/)
    })

    it('completes the trip once every stop is terminal (last stop failed)', async () => {
        const { service, completeTrip } = setup([['s1', 1, StopStatus.ARRIVED, [{ action: 'DROPOFF', shipmentId: 'shA' }]]])
        await service.deliverStop('t1', 's1', { outcome: 'FAILED', reasonCode: 'WRONG_ADDRESS' }, 'drv-1')
        expect(completeTrip).toHaveBeenCalledWith('t1', TripStatus.COMPLETED)
    })

    it('generic stop PATCH cannot set execution statuses', async () => {
        const { service } = setup(TWO_STOPS)
        await expect(service.updateStop('t1', 's1', { status: StopStatus.COMPLETED })).rejects.toThrow(/driver arrive \/ deliver/)
    })
})
