import { computeHaversineLegs } from './haversine-route'

const STOPS = [
    { lat: 14.5995, lng: 120.9842 },
    { lat: 14.5547, lng: 121.0244 },
    { lat: 14.5509, lng: 121.0509 },
]

describe('computeHaversineLegs', () => {
    const env = { ...process.env }
    afterEach(() => {
        process.env = { ...env }
    })

    it('builds one positive leg per consecutive pair and a straight polyline', () => {
        delete process.env.ROUTE_FALLBACK_SPEED_KMH
        const r = computeHaversineLegs(STOPS)
        expect(r.legDistancesM).toHaveLength(2)
        expect(r.legDurationsSec).toHaveLength(2)
        expect(r.legDistancesM.every((d) => d > 0)).toBe(true)
        expect(r.legDurationsSec.every((d) => d > 0)).toBe(true)
        expect(r.polyline).toEqual(STOPS.map((s) => [s.lat, s.lng]))
        expect(r.totalDistanceM).toBe(r.legDistancesM[0] + r.legDistancesM[1])
        // 40 km/h default
        expect(r.legDurationsSec[0]).toBe(Math.round((r.legDistancesM[0] / 1000 / 40) * 3600))
    })

    it('uses ROUTE_FALLBACK_SPEED_KMH when set', () => {
        process.env.ROUTE_FALLBACK_SPEED_KMH = '20'
        const slow = computeHaversineLegs(STOPS)
        delete process.env.ROUTE_FALLBACK_SPEED_KMH
        const normal = computeHaversineLegs(STOPS)
        expect(slow.totalDurationSec).toBeGreaterThan(normal.totalDurationSec * 1.9)
    })
})
