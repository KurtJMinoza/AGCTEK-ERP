import {
    DEFAULT_LAST_MILE_DELAY_SECONDS,
    DEFAULT_PUBLIC_DELAY_SECONDS,
    DEFAULT_PUBLIC_STALE_SECONDS,
    estimateDeliveryWindow,
    lastUpdatedLabel,
    stopServiceSeconds,
    publicCutoff,
    publicTrackingPolicy,
    toPublicMap,
} from './public-position.rules'

const NOW = new Date('2026-10-14T06:00:00.000Z')
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000)

describe('publicTrackingPolicy', () => {
    it('defaults to 150s / 60s last mile / 20 min stale', () => {
        expect(publicTrackingPolicy({})).toEqual({
            delaySeconds: DEFAULT_PUBLIC_DELAY_SECONDS,
            lastMileDelaySeconds: DEFAULT_LAST_MILE_DELAY_SECONDS,
            staleSeconds: DEFAULT_PUBLIC_STALE_SECONDS,
        })
    })

    it('reads env overrides and ignores junk', () => {
        expect(
            publicTrackingPolicy({
                PUBLIC_TRACKING_DELAY_SECONDS: '180',
                PUBLIC_TRACKING_LAST_MILE_DELAY_SECONDS: 'abc',
                PUBLIC_TRACKING_STALE_SECONDS: '-5',
            }),
        ).toEqual({ delaySeconds: 180, lastMileDelaySeconds: 60, staleSeconds: 1200 })
    })

    it('never lets last mile be later than the default delay', () => {
        const policy = publicTrackingPolicy({
            PUBLIC_TRACKING_DELAY_SECONDS: '30',
            PUBLIC_TRACKING_LAST_MILE_DELAY_SECONDS: '90',
        })
        expect(policy.lastMileDelaySeconds).toBe(30)
    })
})

describe('estimateDeliveryWindow', () => {
    const base = { serviceSecondsPerStop: 300, basis: 'road' as const, now: NOW }

    it('adds travel and service time at stops ahead, widened and snapped to 5 min', () => {
        expect(
            estimateDeliveryWindow({
                ...base,
                pointRecordedAt: ago(120),
                travelSeconds: 20 * 60,
                stopsBefore: 2,
            }),
        ).toEqual({
            // 05:58 + 20 min + 10 min = 06:28 → 06:25 … 06:38 → 06:40
            from: '2026-10-14T06:25:00.000Z',
            to: '2026-10-14T06:40:00.000Z',
            basis: 'road',
        })
    })

    it('widens by 25% of travel on long legs', () => {
        const eta = estimateDeliveryWindow({
            ...base,
            pointRecordedAt: NOW,
            travelSeconds: 2 * 60 * 60,
            stopsBefore: 0,
        })
        // arrival 08:00, spread 30 min
        expect(eta.from).toBe('2026-10-14T08:00:00.000Z')
        expect(eta.to).toBe('2026-10-14T08:30:00.000Z')
    })

    it('never promises an arrival in the past', () => {
        const eta = estimateDeliveryWindow({
            ...base,
            pointRecordedAt: ago(30 * 60),
            travelSeconds: 60,
            stopsBefore: 0,
        })
        expect(new Date(eta.from).getTime()).toBeGreaterThanOrEqual(NOW.getTime())
        expect(eta.to).toBe('2026-10-14T06:10:00.000Z')
    })

    it('reads the per-stop service time from env', () => {
        expect(stopServiceSeconds({})).toBe(300)
        expect(stopServiceSeconds({ PUBLIC_TRACKING_STOP_SERVICE_SECONDS: '120' })).toBe(120)
    })
})

describe('publicCutoff', () => {
    it('is now minus the delay', () => {
        expect(publicCutoff(NOW, 150).toISOString()).toBe('2026-10-14T05:57:30.000Z')
    })
})

describe('toPublicMap', () => {
    const base = { delaySeconds: 150, lastMile: false, staleSeconds: 1200, now: NOW }
    const point = { latitude: 14.52, longitude: 121.01, heading: 90, recordedAt: ago(150) }

    it('is off when the trip is not in transit, even with a point', () => {
        const map = toPublicMap({ ...base, inTransit: false, point })
        expect(map).toMatchObject({ available: false, reason: 'NOT_IN_TRANSIT', latitude: null })
    })

    it('reports NO_GPS_YET when in transit without a delayed point', () => {
        expect(toPublicMap({ ...base, inTransit: true, point: null })).toMatchObject({
            available: false,
            reason: 'NO_GPS_YET',
        })
    })

    it('shows the delayed point with a last-updated label', () => {
        expect(toPublicMap({ ...base, inTransit: true, point })).toEqual({
            available: true,
            reason: null,
            delaySeconds: 150,
            lastMile: false,
            latitude: 14.52,
            longitude: 121.01,
            heading: 90,
            recordedAt: ago(150).toISOString(),
            lastUpdatedLabel: 'Updated about 2 minutes ago',
            eta: null,
        })
    })

    it('hides a stale point instead of showing a dead pin as current', () => {
        const map = toPublicMap({
            ...base,
            inTransit: true,
            point: { ...point, recordedAt: ago(1201) },
        })
        expect(map).toMatchObject({
            available: false,
            reason: 'WAITING_FOR_UPDATE',
            latitude: null,
            longitude: null,
        })
    })

    it('keeps a point exactly at the stale boundary', () => {
        const map = toPublicMap({
            ...base,
            inTransit: true,
            point: { ...point, recordedAt: ago(1200) },
        })
        expect(map.available).toBe(true)
    })
})

describe('lastUpdatedLabel', () => {
    it.each([
        [20, 'Updated just now'],
        [60, 'Updated about 1 minute ago'],
        [179, 'Updated about 2 minutes ago'],
        [3600, 'Updated about 1 hour ago'],
        [7300, 'Updated about 2 hours ago'],
    ])('%is ago → %s', (seconds, label) => {
        expect(lastUpdatedLabel(ago(seconds), NOW)).toBe(label)
    })
})
