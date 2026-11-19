import { ConflictException } from '@nestjs/common'
import { StopStatus, TripStatus, TripStopType } from '@prisma/client'
import { assertPickupsDone, isPickupStop, openPickups, pickupsPrecedeDropoffs } from './ocular-stops.rules'
import { TripsService } from './trips.service'

const pickup = (sequence: number, status: StopStatus = StopStatus.PENDING) => ({
    sequence,
    status,
    stopType: TripStopType.SHIP,
})
const dropoff = (sequence: number, status: StopStatus = StopStatus.PENDING) => ({
    sequence,
    status,
    stopType: TripStopType.TO,
})

describe('ocular stop rules', () => {
    it('treats SHIP as pickup and everything else as dropoff', () => {
        expect(isPickupStop(pickup(1))).toBe(true)
        expect(isPickupStop(dropoff(2))).toBe(false)
        expect(isPickupStop({ stopType: null })).toBe(false)
    })

    it('lists only pickups that are not completed', () => {
        const stops = [pickup(1, StopStatus.COMPLETED), pickup(2), pickup(3, StopStatus.ARRIVED), dropoff(4)]
        expect(openPickups(stops).map((s) => s.sequence)).toEqual([2, 3])
    })

    it('requires every pickup before every dropoff', () => {
        expect(pickupsPrecedeDropoffs([pickup(1), pickup(2), dropoff(3)])).toBe(true)
        expect(pickupsPrecedeDropoffs([dropoff(1), dropoff(2)])).toBe(true)
        expect(pickupsPrecedeDropoffs([pickup(1), dropoff(2), pickup(3)])).toBe(false)
    })

    describe('start gate', () => {
        it('blocks while any pickup is open and names it', () => {
            expect(() => assertPickupsDone([pickup(1, StopStatus.COMPLETED), pickup(2), dropoff(3)])).toThrow(
                /pickup point done.*#2/,
            )
        })

        it('passes when all pickups are done, or there are none', () => {
            expect(() => assertPickupsDone([pickup(1, StopStatus.COMPLETED), dropoff(2)])).not.toThrow()
            expect(() => assertPickupsDone([dropoff(1)])).not.toThrow()
        })
    })

    describe('TripsService start gate', () => {
        const make = (stops: unknown[], purpose = 'OCULAR') => {
            const service = new TripsService(
                {} as never,
                {} as never,
                {} as never,
                {} as never,
                {} as never,
                {} as never,
            )
            jest.spyOn(service, 'findOne').mockResolvedValue({
                id: 't1',
                purpose,
                status: TripStatus.PLANNED,
                vehicleId: 'veh-1',
                stops,
            } as never)
            return service
        }

        it('refuses to start an ocular trip with an open pickup (status endpoint)', async () => {
            const service = make([pickup(1), dropoff(2)])
            await expect(service.updateStatus('t1', TripStatus.IN_TRANSIT)).rejects.toBeInstanceOf(
                ConflictException,
            )
        })

        it('refuses to start through the generic update as well', async () => {
            const service = make([pickup(1), dropoff(2)])
            await expect(service.update('t1', { status: TripStatus.IN_TRANSIT })).rejects.toBeInstanceOf(
                ConflictException,
            )
        })
    })
})
