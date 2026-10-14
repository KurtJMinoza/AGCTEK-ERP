import { TrackingService } from './tracking.service'

const NOW = new Date('2026-10-14T06:00:00.000Z')

function setup(
    trip: Record<string, unknown> | null,
    log: unknown = null,
    extra: { stops?: unknown[]; route?: unknown } = {},
) {
    const prisma = {
        trip: { findUnique: jest.fn().mockResolvedValue(trip) },
        gpsLog: { findFirst: jest.fn().mockResolvedValue(log) },
        tripStop: { findMany: jest.fn().mockResolvedValue(extra.stops ?? []) },
    }
    const osrm = { getRoute: jest.fn().mockResolvedValue(extra.route ?? null) }
    const service = new TrackingService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        osrm as never,
    )
    return { service, prisma, osrm }
}

describe('TrackingService.publicPositionForTrip', () => {
    it('returns null without reading GPS when the trip is not in transit', async () => {
        for (const status of ['READY', 'DISPATCHED', 'COMPLETED', 'CANCELLED']) {
            const { service, prisma } = setup({ status, vehicleId: 'v1', startedAt: NOW })
            await expect(
                service.publicPositionForTrip('t1', { delaySeconds: 150, now: NOW }),
            ).resolves.toBeNull()
            expect(prisma.gpsLog.findFirst).not.toHaveBeenCalled()
        }
    })

    it('returns null for an unknown trip', async () => {
        const { service } = setup(null)
        await expect(
            service.publicPositionForTrip('missing', { delaySeconds: 150, now: NOW }),
        ).resolves.toBeNull()
    })

    it('only reads points at or before now - delay, scoped to the trip', async () => {
        const startedAt = new Date('2026-10-14T05:00:00.000Z')
        const point = {
            latitude: 14.5,
            longitude: 121,
            heading: 45,
            recordedAt: new Date('2026-10-14T05:57:00.000Z'),
        }
        const { service, prisma } = setup(
            { status: 'IN_TRANSIT', vehicleId: 'v1', startedAt },
            point,
        )

        await expect(
            service.publicPositionForTrip('t1', { delaySeconds: 150, now: NOW }),
        ).resolves.toEqual(point)

        const args = prisma.gpsLog.findFirst.mock.calls[0][0]
        expect(args.where.recordedAt).toEqual({
            lte: new Date('2026-10-14T05:57:30.000Z'),
        })
        expect(args.where.OR).toEqual([
            { tripId: 't1' },
            { tripId: null, vehicleId: 'v1', recordedAt: { gte: startedAt } },
        ])
        expect(args.orderBy).toEqual({ recordedAt: 'desc' })
        // Identity-free projection: no id / vehicleId / rawPayload
        expect(Object.keys(args.select).sort()).toEqual([
            'heading',
            'latitude',
            'longitude',
            'recordedAt',
        ])
    })

    it('uses only trip-stamped logs when the trip has no vehicle or start time', async () => {
        const { service, prisma } = setup({ status: 'IN_TRANSIT', vehicleId: null, startedAt: null })
        await service.publicPositionForTrip('t1', { delaySeconds: 60, now: NOW })
        expect(prisma.gpsLog.findFirst.mock.calls[0][0].where.OR).toEqual([{ tripId: 't1' }])
    })
})

describe('TrackingService.publicEtaForStop', () => {
    const point = {
        latitude: 14.5,
        longitude: 121,
        heading: null,
        recordedAt: new Date('2026-10-14T05:58:00.000Z'),
    }

    it('routes through open stops ahead of the shopper via OSRM', async () => {
        const { service, osrm, prisma } = setup(null, null, {
            stops: [
                { sequence: 2, lat: 14.51, lng: 121.01 },
                { sequence: 3, lat: null, lng: null },
                { sequence: 4, lat: 14.52, lng: 121.02 },
            ],
            route: { totalDurationSec: 900 },
        })
        const eta = await service.publicEtaForStop('t1', 4, point, NOW)

        expect(prisma.tripStop.findMany.mock.calls[0][0].where).toEqual({
            tripId: 't1',
            sequence: { lte: 4 },
            status: { in: ['PENDING', 'ARRIVED'] },
        })
        expect(osrm.getRoute).toHaveBeenCalledWith([
            { lat: 14.5, lng: 121 },
            { lat: 14.51, lng: 121.01 },
            { lat: 14.52, lng: 121.02 },
        ])
        // 05:58 + 15 min travel + 1 stop × 5 min = 06:18 → window 06:15–06:30
        expect(eta).toEqual({
            from: '2026-10-14T06:15:00.000Z',
            to: '2026-10-14T06:30:00.000Z',
            basis: 'road',
        })
    })

    it('falls back to a straight-line estimate when OSRM is unavailable', async () => {
        const { service } = setup(null, null, {
            stops: [{ sequence: 1, lat: 14.6, lng: 121 }],
        })
        const eta = await service.publicEtaForStop('t1', 1, point, NOW)
        expect(eta?.basis).toBe('straight_line')
    })

    it('returns null when the shopper stop is settled or has no coordinates', async () => {
        const settled = setup(null, null, { stops: [{ sequence: 2, lat: 1, lng: 1 }] })
        await expect(settled.service.publicEtaForStop('t1', 5, point, NOW)).resolves.toBeNull()
        const noCoords = setup(null, null, { stops: [{ sequence: 5, lat: null, lng: null }] })
        await expect(noCoords.service.publicEtaForStop('t1', 5, point, NOW)).resolves.toBeNull()
    })
})
