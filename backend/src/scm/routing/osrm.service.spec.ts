import { OsrmService } from './osrm.service'

// App order is { lat, lng }
const MANILA = { lat: 14.5995, lng: 120.9842 }
const MAKATI = { lat: 14.5547, lng: 121.0244 }
const BGC = { lat: 14.5509, lng: 121.0509 }

function okResponse() {
    return {
        ok: true,
        status: 200,
        json: async () => ({
            code: 'Ok',
            routes: [
                {
                    distance: 14521.4,
                    duration: 1154.6,
                    geometry: {
                        type: 'LineString',
                        // GeoJSON is [lng, lat]
                        coordinates: [
                            [120.9842, 14.5995],
                            [120.99, 14.59],
                            [121.01, 14.57],
                            [121.0244, 14.5547],
                            [121.04, 14.552],
                            [121.0509, 14.5509],
                        ],
                    },
                    legs: [
                        { distance: 9000.2, duration: 700.4 },
                        { distance: 5521.2, duration: 454.2 },
                    ],
                },
            ],
        }),
    }
}

describe('OsrmService', () => {
    const env = { ...process.env }
    const realFetch = global.fetch
    let service: OsrmService

    beforeEach(() => {
        service = new OsrmService()
        process.env.OSRM_BASE_URL = 'http://osrm.local/'
        delete process.env.OSRM_TIMEOUT_MS
    })

    afterEach(() => {
        process.env = { ...env }
        global.fetch = realFetch
    })

    it('returns null without calling OSRM when OSRM_BASE_URL is unset or empty', async () => {
        const fetchMock = jest.fn()
        global.fetch = fetchMock
        delete process.env.OSRM_BASE_URL
        await expect(service.getRoute([MANILA, MAKATI])).resolves.toBeNull()
        process.env.OSRM_BASE_URL = '   '
        await expect(service.getRoute([MANILA, MAKATI])).resolves.toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('sends lng,lat to OSRM and returns the polyline as [lat, lng]', async () => {
        const fetchMock = jest.fn().mockResolvedValue(okResponse())
        global.fetch = fetchMock
        const r = await service.getRoute([MANILA, MAKATI, BGC])

        expect(fetchMock.mock.calls[0][0]).toBe(
            'http://osrm.local/route/v1/driving/120.9842,14.5995;121.0244,14.5547;121.0509,14.5509?overview=full&geometries=geojson&steps=false',
        )
        expect(r).not.toBeNull()
        expect(r!.polyline[0]).toEqual([14.5995, 120.9842])
        expect(r!.polyline[r!.polyline.length - 1]).toEqual([14.5509, 121.0509])
        expect(r!.polyline.length).toBeGreaterThan(3)
        expect(r).toMatchObject({
            totalDistanceM: 14521,
            totalDurationSec: 1155,
            legDurationsSec: [700, 454],
            legDistancesM: [9000, 5521],
        })
    })

    it('returns null on HTTP errors', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
        await expect(service.getRoute([MANILA, MAKATI])).resolves.toBeNull()
    })

    it('returns null when OSRM code is not Ok', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ code: 'NoRoute', message: 'Impossible route' }),
        })
        await expect(service.getRoute([MANILA, MAKATI])).resolves.toBeNull()
    })

    it('returns null on network errors (never throws)', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))
        await expect(service.getRoute([MANILA, MAKATI])).resolves.toBeNull()
    })

    it('aborts after OSRM_TIMEOUT_MS and returns null', async () => {
        process.env.OSRM_TIMEOUT_MS = '50'
        global.fetch = jest.fn(
            (_url: string, init?: { signal?: AbortSignal }) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
                }),
        ) as never
        const started = Date.now()
        await expect(service.getRoute([MANILA, MAKATI])).resolves.toBeNull()
        expect(Date.now() - started).toBeLessThan(2000)
    })

    it('returns null when the leg count does not match the stops', async () => {
        global.fetch = jest.fn().mockResolvedValue(okResponse())
        await expect(service.getRoute([MANILA, BGC])).resolves.toBeNull()
    })
})
