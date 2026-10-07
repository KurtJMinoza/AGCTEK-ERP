import { BadRequestException } from '@nestjs/common'
import { TmsTripsService } from './tms-trips.service'

const WH = {
    id: 'wh-1',
    code: 'WH1',
    name: 'Main',
    address: '1 Main St',
    status: 'ACTIVE',
    deletedAt: null,
    lat: 14.6,
    lng: 120.98,
    geocodeConfirmed: true,
}

const VEHICLE = { id: 'v-1', code: 'V1', plateNumber: 'ABC', capacityQty: 100, status: 'AVAILABLE' }

function planWith(warehouse: Record<string, unknown> | null, shipFromWarehouseId: string | null = 'wh-1') {
    return {
        id: 'lp-1',
        code: 'LP-1',
        status: 'READY',
        vehicleId: 'v-1',
        vehicle: VEHICLE,
        totalQty: 5,
        totalWeightKg: 0,
        totalVolumeM3: 0,
        lines: [
            {
                id: 'lpl-1',
                assignedQty: 5,
                shipmentLine: {
                    id: 'sl-1',
                    shipmentId: 'shp-1',
                    shipFromWarehouseId,
                    shipFromWarehouse: warehouse,
                    shipFromAddress: 'stale copy',
                    shipFromLat: 1,
                    shipFromLng: 1,
                    shipToAddress: 'Customer St',
                    shipToLat: 14.55,
                    shipToLng: 121.02,
                    returnWarehouseId: null,
                    returnWarehouse: null,
                    returnAddress: null,
                    returnLat: null,
                    returnLng: null,
                    shipment: {
                        reference: 'SHP-1',
                        customerName: 'Acme',
                        movementType: 'DELIVERY',
                        earliestDeliveryAt: null,
                        latestDeliveryAt: null,
                    },
                },
            },
        ],
    }
}

function makeService() {
    const tx = {
        loadPlan: { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        trip: {
            create: jest.fn().mockResolvedValue({ id: 'trip-1' }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
    }
    const prisma = {
        loadPlan: { findUnique: jest.fn() },
        trip: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn() },
        tripStop: { update: jest.fn(), updateMany: jest.fn() },
        driver: {
            findUnique: jest.fn().mockResolvedValue({
                id: 'd-1',
                status: 'AVAILABLE',
                licenseExpiry: new Date('2099-01-01'),
            }),
        },
        warehouse: { findMany: jest.fn() },
        $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    }
    const vehicles = { isBlockedFromRouting: jest.fn().mockReturnValue(false) }
    const service = new TmsTripsService(prisma as never, vehicles as never)
    return { service, prisma, tx }
}

describe('TmsTripsService — location integrity', () => {
    describe('create (confirm)', () => {
        it('snapshots warehouse master coords + kind onto stops inside the transaction', async () => {
            const { service, prisma, tx } = makeService()
            prisma.loadPlan.findUnique.mockResolvedValue(planWith(WH))
            tx.loadPlan.findUnique.mockResolvedValue(planWith(WH))
            prisma.trip.findUnique.mockResolvedValue({ id: 'trip-1' })

            await service.create({ loadPlanId: 'lp-1' })

            const stops = tx.trip.create.mock.calls[0][0].data.stops.create
            expect(stops.map((s: { stopType: string }) => s.stopType)).toEqual(['SHIP', 'TO', 'RETURN'])
            expect(stops[0]).toMatchObject({
                locationKind: 'WAREHOUSE',
                warehouseId: 'wh-1',
                address: '1 Main St',
                lat: 14.6,
                lng: 120.98,
            })
            expect(stops[0].locationSnapshotAt).toBeInstanceOf(Date)
            expect(stops[1]).toMatchObject({ locationKind: 'ADDRESS', lat: 14.55, lng: 121.02 })
        })

        it('revalidates against the warehouse re-read in the transaction (unconfirmed meanwhile)', async () => {
            const { service, prisma, tx } = makeService()
            prisma.loadPlan.findUnique.mockResolvedValue(planWith(WH))
            tx.loadPlan.findUnique.mockResolvedValue(planWith({ ...WH, geocodeConfirmed: false }))

            await expect(service.create({ loadPlanId: 'lp-1' })).rejects.toThrow(/not confirmed/)
            expect(tx.loadPlan.updateMany).not.toHaveBeenCalled()
            expect(tx.trip.create).not.toHaveBeenCalled()
        })

        it.each([
            ['missing (deleted / null include)', null, 'wh-1', /not found/],
            ['deleted', { ...WH, deletedAt: new Date() }, 'wh-1', /is deleted/],
            ['inactive', { ...WH, status: 'INACTIVE' }, 'wh-1', /INACTIVE/],
            ['invalid lat/lng', { ...WH, lat: 999 }, 'wh-1', /invalid coordinates/],
            ['legacy null warehouseId on DELIVERY', null, null, /assign an MM ship-from warehouse/],
        ])('blocks confirm when the warehouse is %s — nothing written', async (_l, wh, whId, msg) => {
            const { service, prisma, tx } = makeService()
            prisma.loadPlan.findUnique.mockResolvedValue(planWith(wh, whId))
            tx.loadPlan.findUnique.mockResolvedValue(planWith(wh, whId))

            const err = await service.create({ loadPlanId: 'lp-1' }).catch((e) => e)
            expect(err).toBeInstanceOf(BadRequestException)
            expect(err.message).toMatch(msg)
            expect(tx.trip.create).not.toHaveBeenCalled()
        })
    })

    describe('validate / dispatch', () => {
        function tripWith(stopOver: Record<string, unknown> = {}, status = 'READY') {
            const shipments = [{ shipment: { movementType: 'DELIVERY' } }]
            const lines = [{ loadPlanLineId: 'lpl-1' }]
            return {
                id: 'trip-1',
                status,
                loadPlanId: 'lp-1',
                driverId: 'd-1',
                vehicle: VEHICLE,
                stops: [
                    {
                        sequence: 1,
                        stopType: 'SHIP',
                        locationKind: 'WAREHOUSE',
                        locationKey: 'WH:wh-1',
                        warehouseId: 'wh-1',
                        name: 'Load · Main',
                        address: '1 Main St',
                        lat: 14.6,
                        lng: 120.98,
                        shipments,
                        lines,
                        ...stopOver,
                    },
                    {
                        sequence: 2,
                        stopType: 'TO',
                        locationKind: 'ADDRESS',
                        locationKey: 'ADDR:customer st',
                        warehouseId: null,
                        name: 'Deliver · Acme',
                        address: 'Customer St',
                        lat: 14.55,
                        lng: 121.02,
                        shipments,
                        lines,
                    },
                ],
            }
        }

        function setup(trip: ReturnType<typeof tripWith>, warehouses: unknown[]) {
            const ctx = makeService()
            ctx.prisma.trip.findUnique.mockResolvedValue(trip)
            ctx.prisma.loadPlan.findUnique.mockResolvedValue({
                id: 'lp-1',
                code: 'LP-1',
                status: 'ASSIGNED',
                lines: [{ id: 'lpl-1', assignedQty: 5, weightKg: 0, volumeM3: 0 }],
            })
            ctx.prisma.warehouse.findMany.mockResolvedValue(warehouses)
            return ctx
        }

        it('dispatch succeeds with confirmed warehouse + valid snapshot coords', async () => {
            const { service, tx } = setup(tripWith(), [WH])
            await service.dispatch('trip-1')
            expect(tx.trip.updateMany).toHaveBeenCalled()
        })

        it('snapshot is stable: master moved after create does not rewrite stop coords', async () => {
            const moved = { ...WH, lat: 10.3, lng: 123.9 }
            const { service, prisma, tx } = setup(tripWith(), [moved])
            await service.dispatch('trip-1')
            expect(tx.trip.updateMany).toHaveBeenCalled()
            expect(prisma.tripStop.update).not.toHaveBeenCalled()
            expect(prisma.tripStop.updateMany).not.toHaveBeenCalled()
        })

        it('dispatch blocked when the warehouse became unconfirmed (address edited)', async () => {
            const { service, tx } = setup(tripWith(), [{ ...WH, geocodeConfirmed: false }])
            await expect(service.dispatch('trip-1')).rejects.toThrow(/not confirmed/)
            expect(tx.trip.updateMany).not.toHaveBeenCalled()
        })

        it('dispatch blocked when the warehouse was deleted (row gone)', async () => {
            const { service } = setup(tripWith(), [])
            await expect(service.dispatch('trip-1')).rejects.toThrow(/not found/)
        })

        it('legacy stop: warehouse hard-deleted (id nulled, WH: key kept) → blocked, not crashed', async () => {
            const { service } = setup(tripWith({ warehouseId: null, locationKind: null }), [])
            await expect(service.dispatch('trip-1')).rejects.toThrow(/must reference an MM warehouse/)
        })

        it('legacy stop without coordinates → blocked', async () => {
            const trip = tripWith()
            trip.stops[1] = { ...trip.stops[1], lat: null, lng: null } as never
            const { service } = setup(trip, [WH])
            await expect(service.dispatch('trip-1')).rejects.toThrow(/has no coordinates/)
        })

        it('validate (PLANNED → READY) applies the same guard', async () => {
            const { service, prisma } = setup(tripWith({}, 'PLANNED'), [{ ...WH, geocodeConfirmed: false }])
            ;(prisma.trip as Record<string, jest.Mock>).updateMany = jest.fn()
            await expect(service.validate('trip-1')).rejects.toThrow(/not confirmed/)
            expect((prisma.trip as Record<string, jest.Mock>).updateMany).not.toHaveBeenCalled()
        })
    })
})
