import { BadRequestException, ConflictException } from '@nestjs/common'
import type { PrismaService } from '../../prisma/prisma.service'
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
    const service = new OcularTripsService(
        prisma as unknown as PrismaService,
        vehicles as unknown as VehiclesService,
        trips as unknown as TripsService,
    )
    return { service, prisma, tx, vehicles, trips }
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
