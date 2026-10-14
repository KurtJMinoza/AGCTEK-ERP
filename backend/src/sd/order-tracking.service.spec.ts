import { NotFoundException, UnauthorizedException } from '@nestjs/common'
import { OrderTrackingService } from './order-tracking.service'

const NOW = new Date('2026-10-14T06:00:00.000Z')
const T0 = new Date('2026-10-14T04:00:00.000Z')
const ETA = {
    from: '2026-10-14T06:15:00.000Z',
    to: '2026-10-14T06:30:00.000Z',
    basis: 'road' as const,
}

const order = {
    id: 'so1',
    orderNumber: 'SO-000005',
    status: 'SHIPPED',
    createdAt: T0,
    updatedAt: T0,
    approvedAt: T0,
    payments: [],
    pickingTasks: [],
}

function pkg(tripStatus: string) {
    return {
        salesOrderId: 'so1',
        status: 'DISPATCHED',
        createdAt: T0,
        updatedAt: T0,
        pickingTask: null,
        shipment: {
            id: 'sh1',
            status: 'IN_TRANSIT',
            createdAt: T0,
            deliveredAt: null,
            tripStopShipments: [
                {
                    action: 'DROPOFF',
                    tripStop: {
                        status: 'PENDING',
                        completedAt: null,
                        failedAt: null,
                        failureCode: null,
                        trip: { id: 't1', status: tripStatus, startedAt: T0, createdAt: T0 },
                    },
                },
            ],
        },
    }
}

function link(tripStatus: string, stops: Array<{ sequence: number; status: string }>) {
    return {
        shipment: { destLat: 14.6, destLng: 121.05 },
        tripStop: {
            sequence: 3,
            lat: 14.55,
            lng: 121.02,
            trip: { id: 't1', status: tripStatus, stops },
        },
    }
}

function setup(opts: {
    orders?: unknown[]
    packages?: unknown[]
    link?: unknown
    point?: unknown
}) {
    const orders = opts.orders ?? [order]
    const prisma = {
        sdSalesOrder: {
            findMany: jest.fn().mockResolvedValue(orders),
            findFirst: jest.fn().mockResolvedValue(orders[0] ?? null),
        },
        wmPackage: { findMany: jest.fn().mockResolvedValue(opts.packages ?? []) },
        tripStopShipment: { findFirst: jest.fn().mockResolvedValue(opts.link ?? null) },
    }
    const tracking = {
        publicPositionForTrip: jest.fn().mockResolvedValue(opts.point ?? null),
        publicEtaForStop: jest.fn().mockResolvedValue(ETA),
    }
    const sessions = {
        issueTrackingLink: jest.fn((id: string) => ({ token: `link-${id}`, expiresAt: 'x' })),
        verifyTrackingLink: jest.fn((token: string) => {
            if (!token.startsWith('link-')) throw new UnauthorizedException('bad link')
            return token.slice('link-'.length)
        }),
    }
    const service = new OrderTrackingService(
        prisma as never,
        tracking as never,
        sessions as never,
    )
    return { service, prisma, tracking, sessions }
}

describe('OrderTrackingService.buildForCustomer', () => {
    const OLD_ENV = process.env
    beforeEach(() => {
        process.env = { ...OLD_ENV }
        delete process.env.PUBLIC_TRACKING_DELAY_SECONDS
        delete process.env.PUBLIC_TRACKING_LAST_MILE_DELAY_SECONDS
        delete process.env.PUBLIC_TRACKING_STALE_SECONDS
    })
    afterAll(() => {
        process.env = OLD_ENV
    })

    it('rejects anonymous callers', async () => {
        const { service } = setup({})
        await expect(service.buildForCustomer('so1', null, NOW)).rejects.toBeInstanceOf(
            UnauthorizedException,
        )
    })

    it("returns 404 for another customer's order (ownership filter in the query)", async () => {
        const { service, prisma } = setup({ orders: [] })
        await expect(service.buildForCustomer('so1', 'other', NOW)).rejects.toBeInstanceOf(
            NotFoundException,
        )
        expect(prisma.sdSalesOrder.findMany.mock.calls[0][0].where).toMatchObject({
            customerId: 'other',
        })
    })

    it('keeps the map off and skips GPS when packed but the trip has not started', async () => {
        const { service, tracking } = setup({
            packages: [pkg('READY')],
            link: link('READY', [{ sequence: 1, status: 'PENDING' }]),
        })
        const dto = await service.buildForCustomer('so1', 'c1', NOW)
        expect(dto.customerStatus).toBe('READY_FOR_DELIVERY')
        expect(dto.map).toMatchObject({ available: false, reason: 'NOT_IN_TRANSIT' })
        expect(dto.destination).toEqual({ lat: 14.55, lng: 121.02, label: 'Delivery address' })
        expect(tracking.publicPositionForTrip).not.toHaveBeenCalled()
    })

    it('shows the delayed position with the default delay while other stops are pending', async () => {
        const point = {
            latitude: 14.52,
            longitude: 121.01,
            heading: 90,
            recordedAt: new Date('2026-10-14T05:57:00.000Z'),
        }
        const { service, tracking } = setup({
            packages: [pkg('IN_TRANSIT')],
            link: link('IN_TRANSIT', [
                { sequence: 1, status: 'COMPLETED' },
                { sequence: 2, status: 'PENDING' },
                { sequence: 3, status: 'PENDING' },
            ]),
            point,
        })
        const dto = await service.buildForCustomer('so1', 'c1', NOW)

        expect(dto.customerStatus).toBe('IN_TRANSIT')
        expect(tracking.publicPositionForTrip).toHaveBeenCalledWith('t1', {
            delaySeconds: 150,
            now: NOW,
        })
        expect(dto.map).toMatchObject({
            available: true,
            lastMile: false,
            delaySeconds: 150,
            latitude: 14.52,
            longitude: 121.01,
            lastUpdatedLabel: 'Updated about 3 minutes ago',
            eta: ETA,
        })
        expect(tracking.publicEtaForStop).toHaveBeenCalledWith('t1', 3, point, NOW)
        const json = JSON.stringify(dto)
        for (const leak of ['plateNumber', 'telematicsDeviceId', 'vehicleId', 'gpsLogId']) {
            expect(json).not.toContain(leak)
        }
    })

    it('tightens to the last-mile delay when the customer is the next stop', async () => {
        const { service, tracking } = setup({
            packages: [pkg('IN_TRANSIT')],
            link: link('IN_TRANSIT', [
                { sequence: 1, status: 'COMPLETED' },
                { sequence: 2, status: 'FAILED' },
                { sequence: 3, status: 'PENDING' },
            ]),
        })
        const dto = await service.buildForCustomer('so1', 'c1', NOW)
        expect(tracking.publicPositionForTrip).toHaveBeenCalledWith('t1', {
            delaySeconds: 60,
            now: NOW,
        })
        expect(dto.map).toMatchObject({ available: false, reason: 'NO_GPS_YET', lastMile: true })
    })

    describe('signed tracking links', () => {
        it('only lets the owner mint a link', async () => {
            const { service, prisma, sessions } = setup({ orders: [] })
            await expect(service.issueTrackingLink('so1', null)).rejects.toBeInstanceOf(
                UnauthorizedException,
            )
            await expect(service.issueTrackingLink('so1', 'other')).rejects.toBeInstanceOf(
                NotFoundException,
            )
            expect(prisma.sdSalesOrder.findFirst.mock.calls[0][0].where).toEqual({
                id: 'so1',
                customerId: 'other',
            })
            expect(sessions.issueTrackingLink).not.toHaveBeenCalled()
        })

        it('mints a link for the owner', async () => {
            const { service } = setup({})
            await expect(service.issueTrackingLink('so1', 'c1')).resolves.toEqual({
                token: 'link-so1',
                expiresAt: 'x',
            })
        })

        it('rejects an invalid link before touching the database', async () => {
            const { service, prisma } = setup({})
            await expect(service.buildForTrackingLink('forged', NOW)).rejects.toBeInstanceOf(
                UnauthorizedException,
            )
            expect(prisma.sdSalesOrder.findMany).not.toHaveBeenCalled()
        })

        it('serves the timeline + delayed map with a coarse drop-off area', async () => {
            const { service, prisma } = setup({
                packages: [pkg('IN_TRANSIT')],
                link: {
                    ...link('IN_TRANSIT', [{ sequence: 3, status: 'PENDING' }]),
                    tripStop: {
                        ...link('IN_TRANSIT', [{ sequence: 3, status: 'PENDING' }]).tripStop,
                        lat: 14.551234,
                        lng: 121.026789,
                    },
                },
                point: {
                    latitude: 14.52,
                    longitude: 121.01,
                    heading: null,
                    recordedAt: new Date('2026-10-14T05:58:00.000Z'),
                },
            })
            const dto = await service.buildForTrackingLink('link-so1', NOW)
            expect(prisma.sdSalesOrder.findMany.mock.calls[0][0].where).toEqual({
                id: { in: ['so1'] },
            })
            expect(dto.customerStatus).toBe('IN_TRANSIT')
            expect(dto.destination).toEqual({ lat: 14.551, lng: 121.027, label: 'Delivery area' })
            expect(dto.map).toMatchObject({ available: true, lastMile: true })
        })
    })

    it('returns no destination and map off when the order has no trip yet', async () => {
        const { service } = setup({ link: null })
        const dto = await service.buildForCustomer('so1', 'c1', NOW)
        expect(dto.destination).toBeNull()
        expect(dto.map).toMatchObject({ available: false, reason: 'NOT_IN_TRANSIT' })
    })
})
