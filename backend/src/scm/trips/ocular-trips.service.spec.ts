import { BadRequestException, ConflictException } from '@nestjs/common'
import type { PrismaService } from '../../prisma/prisma.service'
import type { OsrmService } from '../routing/osrm.service'
import type { VehiclesService } from '../vehicles/vehicles.service'
import { OcularTripsService } from './ocular-trips.service'
import type { TripsService } from './trips.service'

const at = (hour: number) => new Date(Date.UTC(2026, 10, 20, hour)).toISOString()

function trip(overrides: Record<string, unknown> = {}) {
    return {
        id: 'trip-1',
        purpose: 'OCULAR',
        status: 'PLANNED',
        vehicleId: 'veh-1',
        plannedStartAt: new Date(at(9)),
        plannedEndAt: new Date(at(17)),
        stops: [
            { id: 's1', sequence: 1, status: 'PENDING', createdLeadId: null },
            { id: 's2', sequence: 2, status: 'PENDING', createdLeadId: null },
            { id: 's3', sequence: 3, status: 'PENDING', createdLeadId: null },
        ],
        ...overrides,
    }
}

function setup(tripRow: ReturnType<typeof trip> | null = trip(), free = ['veh-1']) {
    const tx = {
        tripStop: {
            create: jest.fn().mockResolvedValue({ id: 'new-stop' }),
            updateMany: jest.fn().mockResolvedValue({ count: 3 }),
            update: jest.fn().mockResolvedValue({}),
            delete: jest.fn().mockResolvedValue({}),
        },
    }
    const prisma = {
        trip: {
            findUnique: jest.fn().mockResolvedValue(tripRow),
            create: jest.fn().mockResolvedValue({ id: 'trip-new' }),
            update: jest.fn().mockResolvedValue({}),
        },
        tripStop: {
            create: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        driver: { findUnique: jest.fn().mockResolvedValue({ id: 'drv-1' }) },
        crmLead: { findUnique: jest.fn().mockResolvedValue({ id: 'lead-1' }) },
        sdCustomer: { findUnique: jest.fn().mockResolvedValue({ id: 'cust-1' }) },
        $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    }
    const vehicles = {
        findOne: jest.fn().mockResolvedValue({ id: 'veh-1' }),
        isBlockedFromRouting: jest.fn().mockReturnValue(false),
        availableVehicles: jest.fn().mockResolvedValue(free.map((id) => ({ id }))),
    }
    const trips = {
        findOne: jest.fn().mockResolvedValue({ id: 'trip-1' }),
        updateStatus: jest.fn().mockResolvedValue({}),
    }
    const osrm = { baseUrl: null as string | null, getRoute: jest.fn().mockResolvedValue(null) }
    const service = new OcularTripsService(
        prisma as unknown as PrismaService,
        vehicles as unknown as VehiclesService,
        trips as unknown as TripsService,
        osrm as unknown as OsrmService,
    )
    return { service, prisma, tx, vehicles, trips, osrm }
}

describe('OcularTripsService', () => {
    describe('create', () => {
        it('creates an OCULAR trip with ordered stops and no load plan', async () => {
            const { service, prisma } = setup()
            await service.create({
                vehicleId: 'veh-1',
                windowStart: at(9),
                windowEnd: at(17),
                stops: [
                    { address: 'A', lat: 7.1, lng: 125.6 },
                    { address: 'B' },
                ],
            })
            const data = prisma.trip.create.mock.calls[0][0].data
            expect(data).toEqual(
                expect.objectContaining({ purpose: 'OCULAR', status: 'PLANNED', loadPlanId: null }),
            )
            expect(data.stops.create.map((s: { sequence: number }) => s.sequence)).toEqual([1, 2])
            expect(data.stops.create[1]).toEqual(expect.objectContaining({ lat: null, lng: null }))
        })

        it('needs a window and rejects an unavailable vehicle', async () => {
            await expect(setup().service.create({ vehicleId: 'veh-1' })).rejects.toBeInstanceOf(
                BadRequestException,
            )
            await expect(
                setup().service.create({ vehicleId: 'veh-1', windowStart: at(17), windowEnd: at(9) }),
            ).rejects.toBeInstanceOf(BadRequestException)
            const { service, prisma } = setup(trip(), [])
            await expect(
                service.create({ vehicleId: 'veh-1', windowStart: at(9), windowEnd: at(17) }),
            ).rejects.toBeInstanceOf(ConflictException)
            expect(prisma.trip.create).not.toHaveBeenCalled()
        })

        it('requires lat and lng together and within range', async () => {
            const { service } = setup()
            await expect(
                service.addStop('trip-1', { address: 'A', lat: 7.1 }),
            ).rejects.toThrow(/together/)
            await expect(
                service.addStop('trip-1', { address: 'A', lat: 95, lng: 125 }),
            ).rejects.toThrow(/lat/)
        })
    })

    describe('stops', () => {
        it('appends a stop after the last sequence', async () => {
            const { service, prisma } = setup()
            await service.addStop('trip-1', { address: 'Davao City', lat: 7.07, lng: 125.6 })
            expect(prisma.tripStop.create.mock.calls[0][0].data).toEqual(
                expect.objectContaining({ tripId: 'trip-1', sequence: 4, address: 'Davao City' }),
            )
        })

        it('reorders only with every stop listed exactly once', async () => {
            const { service, tx } = setup()
            await service.reorderStops('trip-1', { stopIds: ['s3', 's1', 's2'] })
            const sequences = tx.tripStop.update.mock.calls.map(
                (c) => [c[0].where.id, c[0].data.sequence] as const,
            )
            expect(sequences).toEqual([
                ['s3', 1],
                ['s1', 2],
                ['s2', 3],
            ])
            for (const stopIds of [['s1', 's2'], ['s1', 's1', 's2'], ['s1', 's2', 'x']]) {
                await expect(service.reorderStops('trip-1', { stopIds })).rejects.toBeInstanceOf(
                    BadRequestException,
                )
            }
        })

        it('removes a pending stop and renumbers; refuses one that captured a lead', async () => {
            const { service, tx } = setup()
            await service.removeStop('trip-1', 's2')
            expect(tx.tripStop.delete).toHaveBeenCalledWith({ where: { id: 's2' } })
            expect(tx.tripStop.update.mock.calls.map((c) => c[0].data.sequence)).toEqual([1, 2])

            const withLead = trip({
                stops: [{ id: 's1', sequence: 1, status: 'PENDING', createdLeadId: 'lead-1' }],
            })
            await expect(setup(withLead).service.removeStop('trip-1', 's1')).rejects.toBeInstanceOf(
                ConflictException,
            )
        })

        it('refuses to edit a finished trip', async () => {
            const { service } = setup(trip({ status: 'COMPLETED' }))
            await expect(service.addStop('trip-1', { address: 'A' })).rejects.toBeInstanceOf(
                ConflictException,
            )
        })

        it('links an existing lead or customer after checking they exist', async () => {
            const { service, prisma } = setup()
            await service.updateStop('trip-1', 's1', { existingLeadId: 'lead-1', customerId: 'cust-1' })
            expect(prisma.tripStop.update.mock.calls[0][0].data).toEqual(
                expect.objectContaining({ existingLeadId: 'lead-1', customerId: 'cust-1' }),
            )
            prisma.crmLead.findUnique.mockResolvedValue(null)
            await expect(
                service.updateStop('trip-1', 's1', { existingLeadId: 'nope' }),
            ).rejects.toBeInstanceOf(BadRequestException)
        })
    })

    describe('field progress', () => {
        const started = (stops: Array<{ id: string; status: string }>) =>
            trip({ status: 'IN_TRANSIT', stops: stops.map((s, i) => ({ sequence: i + 1, createdLeadId: null, ...s })) })

        it('needs a started trip', async () => {
            const { service } = setup()
            await expect(
                service.setStopStatus('trip-1', 's1', { status: 'COMPLETED' }),
            ).rejects.toThrow(/Start the trip/)
        })

        it('completes a stop with notes without forcing a lead', async () => {
            const row = started([
                { id: 's1', status: 'PENDING' },
                { id: 's2', status: 'PENDING' },
            ])
            const { service, prisma, trips } = setup(row)
            prisma.trip.findUnique
                .mockResolvedValueOnce(row)
                .mockResolvedValueOnce({ status: 'IN_TRANSIT', stops: [{ status: 'COMPLETED' }, { status: 'PENDING' }] })
            await service.setStopStatus('trip-1', 's1', { status: 'COMPLETED', notes: 'Roof ok' })
            expect(prisma.tripStop.update.mock.calls[0][0].data).toEqual(
                expect.objectContaining({ status: 'COMPLETED', notes: 'Roof ok' }),
            )
            expect(trips.updateStatus).not.toHaveBeenCalled()
        })

        it('completes the trip once every stop is done or skipped', async () => {
            const row = started([
                { id: 's1', status: 'COMPLETED' },
                { id: 's2', status: 'PENDING' },
            ])
            const { service, prisma, trips } = setup(row)
            prisma.trip.findUnique
                .mockResolvedValueOnce(row)
                .mockResolvedValueOnce({ status: 'IN_TRANSIT', stops: [{ status: 'COMPLETED' }, { status: 'SKIPPED' }] })
            await service.setStopStatus('trip-1', 's2', { status: 'SKIPPED' })
            expect(trips.updateStatus).toHaveBeenCalledWith('trip-1', 'COMPLETED')
        })

        it('rejects unknown actions and finished stops', async () => {
            const row = started([{ id: 's1', status: 'COMPLETED' }, { id: 's2', status: 'PENDING' }])
            const { service } = setup(row)
            await expect(
                service.setStopStatus('trip-1', 's2', { status: 'EN_ROUTE' }),
            ).rejects.toBeInstanceOf(BadRequestException)
            await expect(
                service.setStopStatus('trip-1', 's1', { status: 'SKIPPED' }),
            ).rejects.toBeInstanceOf(ConflictException)
        })
    })

    describe('pickup points', () => {
        const pickup = (id: string, sequence: number, status = 'PENDING') => ({
            id,
            sequence,
            status,
            stopType: 'SHIP',
            createdLeadId: null,
        })
        const dropoff = (id: string, sequence: number, status = 'PENDING') => ({
            id,
            sequence,
            status,
            stopType: 'TO',
            createdLeadId: null,
        })

        it('creates pickups ahead of dropoffs whatever order they are given', async () => {
            const { service, prisma } = setup()
            await service.create({
                vehicleId: 'veh-1',
                windowStart: at(9),
                windowEnd: at(17),
                stops: [
                    { address: 'visit A' },
                    { address: 'pickup X', type: 'PICKUP' },
                    { address: 'visit B', type: 'DROPOFF' },
                ],
            })
            const rows = prisma.trip.create.mock.calls[0][0].data.stops.create as Array<{
                address: string
                sequence: number
                stopType: string
            }>
            expect(rows.map((r) => [r.address, r.sequence, r.stopType])).toEqual([
                ['pickup X', 1, 'SHIP'],
                ['visit A', 2, 'TO'],
                ['visit B', 3, 'TO'],
            ])
        })

        it('inserts a new pickup after the last pickup and ahead of every dropoff', async () => {
            const { service, tx } = setup(
                trip({ stops: [pickup('p1', 1), dropoff('d1', 2), dropoff('d2', 3)] }),
            )
            await service.addStop('trip-1', { address: 'second pickup', type: 'PICKUP' })
            expect(tx.tripStop.create.mock.calls[0][0].data).toMatchObject({ stopType: 'SHIP' })
            const order = tx.tripStop.update.mock.calls.map(
                (call) => [call[0].where.id, call[0].data.sequence] as const,
            )
            expect(order).toEqual([
                ['p1', 1],
                ['new-stop', 2],
                ['d1', 3],
                ['d2', 4],
            ])
        })

        it('rejects a new pickup once the trip has started', async () => {
            const { service } = setup(trip({ status: 'IN_TRANSIT', stops: [dropoff('d1', 1)] }))
            await expect(
                service.addStop('trip-1', { address: 'late pickup', type: 'PICKUP' }),
            ).rejects.toBeInstanceOf(ConflictException)
        })

        it('rejects an unknown stop type', async () => {
            const { service } = setup()
            await expect(
                service.addStop('trip-1', { address: 'x', type: 'WAYPOINT' }),
            ).rejects.toBeInstanceOf(BadRequestException)
        })

        it('rejects a reorder that puts a dropoff before a pickup', async () => {
            const { service } = setup(trip({ stops: [pickup('p1', 1), dropoff('d1', 2)] }))
            await expect(
                service.reorderStops('trip-1', { stopIds: ['d1', 'p1'] }),
            ).rejects.toThrow(/Pickup points must come before/)
        })

        it('lets a pickup be marked done before the trip starts, without closing the trip', async () => {
            const { service, prisma, trips } = setup(trip({ stops: [pickup('p1', 1)] }))
            await service.setStopStatus('trip-1', 'p1', { status: 'COMPLETED' })
            expect(prisma.tripStop.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'p1' },
                    data: expect.objectContaining({ status: 'COMPLETED' }),
                }),
            )
            expect(trips.updateStatus).not.toHaveBeenCalled()
        })

        it('does not allow a pickup to be skipped', async () => {
            const { service } = setup(trip({ stops: [pickup('p1', 1)] }))
            await expect(
                service.setStopStatus('trip-1', 'p1', { status: 'SKIPPED' }),
            ).rejects.toBeInstanceOf(BadRequestException)
        })

        it('still requires a started trip to work a dropoff', async () => {
            const { service } = setup(trip({ stops: [pickup('p1', 1, 'COMPLETED'), dropoff('d1', 2)] }))
            await expect(
                service.setStopStatus('trip-1', 'd1', { status: 'COMPLETED' }),
            ).rejects.toThrow(/Start the trip/)
        })
    })

    describe('route preview', () => {
        const located = (id: string, sequence: number, lat: number | null, lng: number | null) => ({
            id,
            sequence,
            name: null,
            address: `addr ${id}`,
            lat,
            lng,
            status: 'PENDING',
            createdLeadId: null,
        })

        it('routes located stops in manual order with ETAs from the planned start', async () => {
            const { service, osrm } = setup(
                trip({
                    code: 'OCU-1',
                    vehicle: { id: 'veh-1', code: 'V1', plateNumber: 'ABC' },
                    stops: [
                        located('s1', 1, 14.5, 121.0),
                        located('s2', 2, 14.6, 121.1),
                        located('s3', 3, 14.7, 121.2),
                    ],
                }),
            )
            osrm.getRoute.mockResolvedValue({
                totalDistanceM: 3000,
                totalDurationSec: 600,
                polyline: [[14.5, 121.0], [14.7, 121.2]],
                legDurationsSec: [300, 300],
                legDistancesM: [1000, 2000],
            })

            const out = await service.routePreview('trip-1')

            expect(osrm.getRoute).toHaveBeenCalledWith([
                { lat: 14.5, lng: 121.0 },
                { lat: 14.6, lng: 121.1 },
                { lat: 14.7, lng: 121.2 },
            ])
            expect(out.router).toBe('osrm')
            expect(out.routable).toBe(true)
            expect(out.totalDistanceM).toBe(3000)
            expect(out.stops.map((s) => s.id)).toEqual(['s1', 's2', 's3'])
            // First stop arrives at the planned start (09:00 UTC); 30 min dwell per stop by default.
            expect(out.stops[0].etaAt).toBe(at(9))
            expect(out.stops[1].legDistanceM).toBe(1000)
            expect(new Date(out.stops[1].etaAt as string).getTime()).toBe(
                new Date(at(9)).getTime() + 30 * 60_000 + 300_000,
            )
        })

        it('falls back to haversine when OSRM is unavailable', async () => {
            const { service } = setup(
                trip({ stops: [located('s1', 1, 14.5, 121.0), located('s2', 2, 14.6, 121.1)] }),
            )
            const out = await service.routePreview('trip-1')
            expect(out.router).toBe('haversine')
            expect(out.routerFallbackReason).toMatch(/haversine/)
            expect(out.polyline).toHaveLength(2)
        })

        it('is not routable with fewer than two pinned stops and flags the unpinned one', async () => {
            const { service, osrm } = setup(
                trip({ stops: [located('s1', 1, 14.5, 121.0), located('s2', 2, null, null)] }),
            )
            const out = await service.routePreview('trip-1')
            expect(osrm.getRoute).not.toHaveBeenCalled()
            expect(out.routable).toBe(false)
            expect(out.polyline).toEqual([])
            expect(out.missingCoordsCount).toBe(1)
            expect(out.stops[1].missingCoords).toBe(true)
            expect(out.stops[1].etaAt).toBeNull()
        })

        it('rejects non-ocular trips', async () => {
            const { service } = setup(trip({ purpose: 'DELIVERY' }))
            await expect(service.routePreview('trip-1')).rejects.toBeInstanceOf(BadRequestException)
        })
    })

    describe('route preview schedule', () => {
        const pin = (id: string, sequence: number, lat: number, lng: number) => ({
            id,
            sequence,
            name: null,
            address: `addr ${id}`,
            lat,
            lng,
            status: 'PENDING',
            stopType: 'TO',
            createdLeadId: null,
        })
        const route = (legs: number) => ({
            totalDistanceM: 1000 * legs,
            totalDurationSec: 600 * legs,
            polyline: [] as [number, number][],
            legDurationsSec: Array(legs).fill(600),
            legDistancesM: Array(legs).fill(1000),
        })
        const iso = (hour: number, minute = 0) =>
            new Date(Date.UTC(2026, 10, 20, hour, minute)).toISOString()

        beforeEach(() => {
            jest.useFakeTimers({ now: new Date(at(6)) })
        })
        afterEach(() => {
            jest.useRealTimers()
        })

        const twoStops = () =>
            setup(trip({ stops: [pin('s1', 1, 14.5, 121.0), pin('s2', 2, 14.6, 121.1)] }))

        it('recommends the latest start that still finishes inside the trip window', async () => {
            const { service, osrm } = twoStops()
            osrm.getRoute.mockResolvedValue(route(1))
            const out = await service.routePreview('trip-1')
            // Window ends 17:00: last visit starts by 16:30, the first by 16:30 − 10 min leg − 30 min visit.
            expect(out.recommendedDeparture).toMatchObject({
                at: iso(15, 50),
                feasible: true,
                basis: 'LATEST_MEETING_WINDOWS',
            })
            // The run itself starts at the planned window start unless overridden.
            expect(out.departAt).toBe(at(9))
            expect(out.feasible).toBe(true)
            expect(out.violations).toEqual([])
        })

        it('EARLY mode recommends the earliest practical start', async () => {
            const { service, osrm } = twoStops()
            osrm.getRoute.mockResolvedValue(route(1))
            const out = await service.routePreview('trip-1', { departureMode: 'EARLY' })
            expect(out.departureMode).toBe('EARLY')
            expect(out.recommendedDeparture).toMatchObject({
                at: at(6),
                basis: 'EARLIEST_MEETING_WINDOWS',
            })
        })

        it('uses a departAt override for the schedule', async () => {
            const { service, osrm } = twoStops()
            osrm.getRoute.mockResolvedValue(route(1))
            const out = await service.routePreview('trip-1', { departAt: at(12) })
            expect(out.departAt).toBe(at(12))
            expect(out.stops[0].etaAt).toBe(at(12))
            // 12:00 + 30 min visit + 10 min leg
            expect(out.stops[1].etaAt).toBe(iso(12, 40))
        })

        it('flags visits that finish after the trip window ends', async () => {
            const { service, osrm } = setup(
                trip({
                    plannedEndAt: new Date(at(10)),
                    stops: [pin('s1', 1, 14.5, 121.0), pin('s2', 2, 14.6, 121.1)],
                }),
            )
            osrm.getRoute.mockResolvedValue(route(1))
            const out = await service.routePreview('trip-1')
            // s1 09:00–09:30 fits; s2 arrives 09:40, done 10:10 = 10 min late.
            expect(out.stops[0].windowStatus).toBe('OK')
            expect(out.stops[1].windowStatus).toBe('LATE')
            expect(out.stops[1].lateBySec).toBe(600)
            expect(out.feasible).toBe(false)
            expect(out.violations).toEqual([
                expect.objectContaining({ code: 'LATE', stopId: 's2', lateBySec: 600 }),
            ])
            expect(out.recommendedDeparture?.feasible).toBe(true)
        })

        it('flags a start time that is already in the past', async () => {
            jest.setSystemTime(new Date(at(10)))
            const { service, osrm } = twoStops()
            osrm.getRoute.mockResolvedValue(route(1))
            const out = await service.routePreview('trip-1')
            expect(out.violations.map((v) => v.code)).toContain('DEPARTURE_IN_PAST')
        })

        it('uses the actual start and gives no recommendation once the trip is running', async () => {
            const { service, osrm } = setup(
                trip({
                    status: 'IN_TRANSIT',
                    startedAt: new Date(iso(9, 15)),
                    stops: [pin('s1', 1, 14.5, 121.0), pin('s2', 2, 14.6, 121.1)],
                }),
            )
            osrm.getRoute.mockResolvedValue(route(1))
            const out = await service.routePreview('trip-1')
            expect(out.recommendedDeparture).toBeNull()
            expect(out.departAt).toBe(iso(9, 15))
            expect(out.violations.map((v) => v.code)).not.toContain('DEPARTURE_IN_PAST')
        })

        it('still schedules a single pinned stop (no route line)', async () => {
            const { service } = setup(trip({ stops: [pin('s1', 1, 14.5, 121.0)] }))
            const out = await service.routePreview('trip-1')
            expect(out.routable).toBe(false)
            expect(out.stops[0].etaAt).toBe(at(9))
            expect(out.arrivalAt).toBe(iso(9, 30))
        })

        describe('return to the first pickup', () => {
            const withPickup = () =>
                setup(
                    trip({
                        stops: [
                            { ...pin('p1', 1, 14.5, 121.0), stopType: 'SHIP' },
                            pin('d1', 2, 14.6, 121.1),
                            pin('d2', 3, 14.7, 121.2),
                        ],
                    }),
                )

            it('routes back to the first pickup and counts the drive home', async () => {
                const { service, osrm } = withPickup()
                osrm.getRoute.mockResolvedValue(route(3))
                const out = await service.routePreview('trip-1')

                expect(osrm.getRoute).toHaveBeenCalledWith([
                    { lat: 14.5, lng: 121.0 },
                    { lat: 14.6, lng: 121.1 },
                    { lat: 14.7, lng: 121.2 },
                    { lat: 14.5, lng: 121.0 },
                ])
                expect(out.returnToOrigin).toBe(true)
                expect(out.returnStop).toMatchObject({
                    label: 'Pickup point',
                    lat: 14.5,
                    lng: 121.0,
                    legDistanceM: 1000,
                    legDurationSec: 600,
                })
                // 09:00 pickup done 09:30; +10 → d1 09:40 done 10:10; +10 → d2 10:20 done 10:50; +10 → home 11:00.
                expect(out.stops.map((s) => s.id)).toEqual(['p1', 'd1', 'd2'])
                expect(out.returnStop?.etaAt).toBe(iso(11, 0))
                expect(out.arrivalAt).toBe(iso(11, 0))
                expect(out.totalDistanceM).toBe(3000)
                expect(out.violations).toEqual([])
            })

            it('can be switched off, ending at the last visit', async () => {
                const { service, osrm } = withPickup()
                osrm.getRoute.mockResolvedValue(route(2))
                const out = await service.routePreview('trip-1', { returnToOrigin: 'false' })

                expect(osrm.getRoute).toHaveBeenCalledWith([
                    { lat: 14.5, lng: 121.0 },
                    { lat: 14.6, lng: 121.1 },
                    { lat: 14.7, lng: 121.2 },
                ])
                expect(out.returnToOrigin).toBe(false)
                expect(out.returnStop).toBeNull()
                expect(out.arrivalAt).toBe(iso(10, 50))
            })

            it('has no return without a located pickup', async () => {
                const { service, osrm } = twoStops()
                osrm.getRoute.mockResolvedValue(route(1))
                const out = await service.routePreview('trip-1')
                expect(out.returnToOrigin).toBe(false)
                expect(out.returnStop).toBeNull()
            })

            it('rejects an invalid returnToOrigin flag', async () => {
                const { service } = withPickup()
                await expect(
                    service.routePreview('trip-1', { returnToOrigin: 'maybe' }),
                ).rejects.toBeInstanceOf(BadRequestException)
            })
        })

        it('rejects an invalid departure mode or service time', async () => {
            const { service } = twoStops()
            await expect(
                service.routePreview('trip-1', { departureMode: 'LATE' }),
            ).rejects.toBeInstanceOf(BadRequestException)
            await expect(
                service.routePreview('trip-1', { serviceTimeMin: 9999 }),
            ).rejects.toBeInstanceOf(BadRequestException)
        })
    })

    describe('lead capture event', () => {
        it('links the lead to the stop only when it has none yet', async () => {
            const { service, prisma } = setup()
            await service.onLeadCaptured({ leadId: 'lead-9', tripStopId: 's1' })
            expect(prisma.tripStop.updateMany).toHaveBeenCalledWith({
                where: { id: 's1', createdLeadId: null },
                data: { createdLeadId: 'lead-9' },
            })
        })
    })
})
