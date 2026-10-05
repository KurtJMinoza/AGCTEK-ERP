import { BadRequestException, NotFoundException } from '@nestjs/common'
import { OsrmService } from '../routing/osrm.service'
import { TmsRoutePreviewService } from './tms-route-preview.service'

type LineInput = {
    id: string
    shipToAddress: string
    shipToLat: number | null
    shipToLng: number | null
    earliest?: string
    latest?: string
}

function plan(status: string, lines: LineInput[]) {
    return {
        id: 'lp-1',
        code: 'LP-TEST',
        status,
        vehicle: { id: 'v-1', code: 'V-1', plateNumber: 'ABC-1' },
        lines: lines.map((l) => ({
            id: `lpl-${l.id}`,
            shipmentLine: {
                id: `sl-${l.id}`,
                shipmentId: `shp-${l.id}`,
                shipFromWarehouseId: 'wh-1',
                shipFromWarehouse: { id: 'wh-1', code: 'WH1', name: 'Main Warehouse', address: 'Main St' },
                shipFromAddress: null,
                shipFromLat: 14.5995,
                shipFromLng: 120.9842,
                shipToAddress: l.shipToAddress,
                shipToLat: l.shipToLat,
                shipToLng: l.shipToLng,
                returnWarehouseId: null,
                returnWarehouse: null,
                returnAddress: null,
                returnLat: null,
                returnLng: null,
                shipment: {
                    customerName: `Customer ${l.id}`,
                    earliestDeliveryAt: l.earliest ? new Date(l.earliest) : null,
                    latestDeliveryAt: l.latest ? new Date(l.latest) : null,
                },
            },
        })),
    }
}

describe('TmsRoutePreviewService', () => {
    const findUnique = jest.fn()
    const search = jest.fn()
    const prisma = {
        loadPlan: { findUnique },
        trip: { create: jest.fn() },
        tripStop: { create: jest.fn() },
    }
    let service: TmsRoutePreviewService

    beforeEach(() => {
        jest.clearAllMocks()
        delete process.env.OSRM_BASE_URL
        delete process.env.ROUTE_PREVIEW_GEOCODE
        service = new TmsRoutePreviewService(
            prisma as never,
            new OsrmService(),
            { search } as never,
        )
    })

    it('uses OSRM geometry AND OSRM leg durations for ETAs when OSRM succeeds', async () => {
        findUnique.mockResolvedValue(
            plan('READY', [
                { id: '1', shipToAddress: 'Ayala Ave', shipToLat: 14.5547, shipToLng: 121.0244 },
                { id: '2', shipToAddress: 'BGC', shipToLat: 14.5509, shipToLng: 121.0509 },
            ]),
        )
        const road: [number, number][] = [
            [14.5995, 120.9842],
            [14.59, 120.99],
            [14.57, 121.01],
            [14.5547, 121.0244],
            [14.552, 121.04],
            [14.5509, 121.0509],
            [14.5995, 120.9842],
        ]
        const osrm = {
            baseUrl: 'http://osrm.local',
            getRoute: jest.fn().mockResolvedValue({
                totalDistanceM: 27500,
                totalDurationSec: 6000,
                polyline: road,
                legDurationsSec: [1800, 1800, 2400],
                legDistancesM: [9000, 5500, 13000],
            }),
        }
        service = new TmsRoutePreviewService(prisma as never, osrm as never, { search } as never)

        const departAt = '2099-01-01T00:00:00.000Z'
        const r = await service.preview('lp-1', { departAt, serviceTimeMin: 15 })

        expect(osrm.getRoute).toHaveBeenCalledWith([
            { lat: 14.5995, lng: 120.9842 },
            { lat: 14.5547, lng: 121.0244 },
            { lat: 14.5509, lng: 121.0509 },
            { lat: 14.5995, lng: 120.9842 },
        ])
        expect(r.router).toBe('osrm')
        expect(r.routerFallbackReason).toBeNull()
        expect(r.polyline).toEqual(road)
        expect(r.legDurationsSec).toEqual([1800, 1800, 2400])
        expect(r.stops[1]).toMatchObject({ legDurationSec: 1800, legDistanceM: 9000 })
        // ETA = depart + OSRM leg (30 min); next = + 15 min service + 30 min OSRM leg
        expect(r.stops[1].etaAt).toBe('2099-01-01T00:30:00.000Z')
        expect(r.stops[2].etaAt).toBe('2099-01-01T01:15:00.000Z')
        // Back at the warehouse = + 15 min service + 40 min OSRM leg
        expect(r.stops[3]).toMatchObject({ type: 'RETURN_TO', etaAt: '2099-01-01T02:10:00.000Z' })
        expect(r.arrivalAt).toBe('2099-01-01T02:10:00.000Z')
    })

    it('defaults to 30 min service per stop and ON_TIME departure', async () => {
        findUnique.mockResolvedValue(
            plan('READY', [{ id: '1', shipToAddress: 'Ayala Ave', shipToLat: 14.5547, shipToLng: 121.0244 }]),
        )
        const r = await service.preview('lp-1', {})
        expect(r.serviceTimeMin).toBe(30)
        expect(r.departureMode).toBe('ON_TIME')
    })

    it('rejects an unknown departureMode', async () => {
        findUnique.mockResolvedValue(
            plan('READY', [{ id: '1', shipToAddress: 'Ayala Ave', shipToLat: 14.5547, shipToLng: 121.0244 }]),
        )
        await expect(service.preview('lp-1', { departureMode: 'LATE' })).rejects.toBeInstanceOf(
            BadRequestException,
        )
    })

    it('EARLY recommends arriving as the first window opens; ON_TIME the latest feasible', async () => {
        const day = '2099-01-01'
        findUnique.mockResolvedValue(
            plan('READY', [
                { id: '1', shipToAddress: 'A', shipToLat: 14.5547, shipToLng: 121.0244, earliest: `${day}T08:00:00Z`, latest: `${day}T12:00:00Z` },
            ]),
        )
        const early = await service.preview('lp-1', { departureMode: 'EARLY' })
        const onTime = await service.preview('lp-1', {})
        expect(early.recommendedDeparture?.basis).toBe('EARLIEST_MEETING_WINDOWS')
        expect(onTime.recommendedDeparture?.basis).toBe('LATEST_MEETING_WINDOWS')
        const leg = early.legDurationsSec[0] * 1000
        const earlyAt = Date.parse(early.recommendedDeparture?.at ?? '')
        expect(earlyAt).toBeLessThan(Date.parse(onTime.recommendedDeparture?.at ?? ''))
        expect(earlyAt + leg).toBeGreaterThanOrEqual(Date.parse(`${day}T08:00:00Z`))
        expect(earlyAt + leg).toBeLessThan(Date.parse(`${day}T08:01:00Z`))
    })

    it('falls back to haversine (straight polyline + haversine durations) when OSRM returns null', async () => {
        findUnique.mockResolvedValue(
            plan('READY', [{ id: '1', shipToAddress: 'Ayala Ave', shipToLat: 14.5547, shipToLng: 121.0244 }]),
        )
        const osrm = { baseUrl: 'http://osrm.local', getRoute: jest.fn().mockResolvedValue(null) }
        service = new TmsRoutePreviewService(prisma as never, osrm as never, { search } as never)

        const departAt = '2099-01-01T00:00:00.000Z'
        const r = await service.preview('lp-1', { departAt })
        expect(r.router).toBe('haversine')
        expect(r.routerFallbackReason).toMatch(/OSRM unavailable/)
        expect(r.polyline).toEqual([
            [14.5995, 120.9842],
            [14.5547, 121.0244],
            [14.5995, 120.9842],
        ])
        const leg = r.legDurationsSec[0]
        expect(leg).toBeGreaterThan(0)
        expect(r.stops[1].etaAt).toBe(new Date(Date.parse(departAt) + leg * 1000).toISOString())
    })

    it('404 when the load plan does not exist', async () => {
        findUnique.mockResolvedValue(null)
        await expect(service.preview('x', {})).rejects.toBeInstanceOf(NotFoundException)
    })

    it('400 when the load plan is not READY', async () => {
        findUnique.mockResolvedValue(plan('ASSIGNED', [{ id: '1', shipToAddress: 'A', shipToLat: 14.55, shipToLng: 121.02 }]))
        await expect(service.preview('lp-1', {})).rejects.toBeInstanceOf(BadRequestException)
    })

    it('routes PICKUP → SHIP TO from the load only, dedupes pickup, writes nothing', async () => {
        findUnique.mockResolvedValue(
            plan('READY', [
                { id: '1', shipToAddress: 'Ayala Ave', shipToLat: 14.5547, shipToLng: 121.0244 },
                { id: '2', shipToAddress: 'BGC', shipToLat: 14.5509, shipToLng: 121.0509 },
            ]),
        )
        const r = await service.preview('lp-1', {})
        expect(r.routable).toBe(true)
        expect(r.router).toBe('haversine')
        expect(r.pickupCount).toBe(1)
        expect(r.stops.map((s) => s.type)).toEqual(['PICKUP', 'SHIP_TO', 'SHIP_TO', 'RETURN_TO'])
        expect(r.stops[0].lineCount).toBe(2)
        expect(prisma.trip.create).not.toHaveBeenCalled()
        expect(prisma.tripStop.create).not.toHaveBeenCalled()
        expect(search).not.toHaveBeenCalled()
    })

    it('geocodes a stop without coordinates (not persisted)', async () => {
        findUnique.mockResolvedValue(
            plan('READY', [{ id: '1', shipToAddress: 'Ayala Ave', shipToLat: null, shipToLng: null }]),
        )
        search.mockResolvedValue([{ lat: 14.5547, lng: 121.0244, displayName: 'Ayala' }])
        const r = await service.preview('lp-1', {})
        expect(search).toHaveBeenCalledWith('Ayala Ave', 1, 5000)
        expect(r.routable).toBe(true)
        expect(r.stops[1]).toMatchObject({ coordSource: 'geocoded', lat: 14.5547, missingCoords: false })
    })

    it('blocks the route and lists stops whose coordinates cannot be resolved', async () => {
        findUnique.mockResolvedValue(
            plan('READY', [{ id: '1', shipToAddress: 'Nowhere 123', shipToLat: null, shipToLng: null }]),
        )
        search.mockResolvedValue([])
        const r = await service.preview('lp-1', {})
        expect(r.routable).toBe(false)
        expect(r.polyline).toEqual([])
        expect(r.feasible).toBe(false)
        expect(r.stops[1].missingCoords).toBe(true)
        expect(r.violations).toEqual([
            expect.objectContaining({ code: 'MISSING_COORDS', sequence: 2 }),
        ])
    })

    it('reports LATE and EARLY (with waiting) against windows for a given departure', async () => {
        const day = '2099-01-01'
        findUnique.mockResolvedValue(
            plan('READY', [
                { id: '1', shipToAddress: 'A', shipToLat: 14.5547, shipToLng: 121.0244, earliest: `${day}T01:00:00Z`, latest: `${day}T01:30:00Z` },
                { id: '2', shipToAddress: 'B', shipToLat: 14.5509, shipToLng: 121.0509, earliest: `${day}T09:00:00Z`, latest: `${day}T10:00:00Z` },
            ]),
        )
        const r = await service.preview('lp-1', { departAt: `${day}T01:00:00Z` })
        expect(r.stops.map((s) => s.windowStatus)).toEqual(['NO_WINDOW', 'LATE', 'EARLY', 'NO_WINDOW'])
        expect(r.stops[2].waitingTimeSec).toBeGreaterThan(0)
        expect(r.feasible).toBe(false)
        expect(r.violations.map((v) => v.code)).toEqual(['LATE'])
        expect(r.recommendedDeparture).toMatchObject({ feasible: true, basis: 'LATEST_MEETING_WINDOWS' })
    })

    it('flags a window shorter than the service time as a conflict', async () => {
        const day = '2099-01-01'
        findUnique.mockResolvedValue(
            plan('READY', [
                { id: '1', shipToAddress: 'A', shipToLat: 14.5547, shipToLng: 121.0244, earliest: `${day}T01:00:00Z`, latest: `${day}T01:05:00Z` },
            ]),
        )
        const r = await service.preview('lp-1', {})
        expect(r.violations.map((v) => v.code)).toContain('WINDOW_CONFLICT')
        expect(r.recommendedDeparture).toMatchObject({ feasible: false, basis: 'EARLIEST_PRACTICAL' })
    })
})
