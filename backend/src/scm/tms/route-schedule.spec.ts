import {
    computeSchedule,
    latestFeasibleDeparture,
    recommendDeparture,
    type ScheduleLeg,
    type ScheduleStop,
} from './route-schedule'

const T0 = new Date('2026-10-01T08:00:00.000Z')
const at = (min: number) => new Date(T0.getTime() + min * 60_000)
const leg = (min: number): ScheduleLeg => ({ durationSec: min * 60, distanceM: min * 500 })

const stop = (
    key: string,
    stopType: ScheduleStop['stopType'],
    window?: [number | null, number | null],
    serviceMin = 15,
): ScheduleStop => ({
    key,
    stopType,
    windowStart: window?.[0] != null ? at(window[0]) : null,
    windowEnd: window?.[1] != null ? at(window[1]) : null,
    serviceSec: serviceMin * 60,
})

describe('computeSchedule', () => {
    it('accumulates travel and service time from the PICKUP departure', () => {
        const stops = [stop('P', 'SHIP'), stop('A', 'TO'), stop('B', 'TO'), stop('R', 'RETURN', undefined, 0)]
        const s = computeSchedule(stops, [leg(30), leg(20), leg(40)], T0)
        expect(s[0].departureAt).toEqual(T0)
        expect(s[1].arrivalAt).toEqual(at(30))
        expect(s[1].departureAt).toEqual(at(45))
        expect(s[2].arrivalAt).toEqual(at(65))
        expect(s[3].arrivalAt).toEqual(at(120))
        expect(s.every((x) => x.windowStatus === 'NO_WINDOW')).toBe(true)
    })

    it('marks EARLY and waits until the window opens (ETA not clamped)', () => {
        const stops = [stop('P', 'SHIP'), stop('A', 'TO', [60, 120]), stop('B', 'TO')]
        const s = computeSchedule(stops, [leg(30), leg(10)], T0)
        expect(s[1].windowStatus).toBe('EARLY')
        expect(s[1].arrivalAt).toEqual(at(30))
        expect(s[1].waitSec).toBe(30 * 60)
        expect(s[1].serviceStartAt).toEqual(at(60))
        expect(s[2].arrivalAt).toEqual(at(85))
    })

    it('marks LATE by service end and keeps the real ETA', () => {
        // arrive +30, service done +45, window closes +20 → 25 min late
        const stops = [stop('P', 'SHIP'), stop('A', 'TO', [null, 20])]
        const s = computeSchedule(stops, [leg(30)], T0)
        expect(s[1].windowStatus).toBe('LATE')
        expect(s[1].arrivalAt).toEqual(at(30))
        expect(s[1].lateBySec).toBe(25 * 60)
    })

    it('is LATE when arrival is inside the window but service runs past it', () => {
        const stops = [stop('P', 'SHIP'), stop('A', 'TO', [0, 35])]
        const s = computeSchedule(stops, [leg(30)], T0)
        expect(s[1]).toMatchObject({ windowStatus: 'LATE', lateBySec: 10 * 60 })
    })

    it('rejects a leg count that does not match the stops', () => {
        expect(() => computeSchedule([stop('P', 'SHIP'), stop('A', 'TO')], [], T0)).toThrow()
    })
})

describe('latestFeasibleDeparture', () => {
    it('works backward through legs and service times', () => {
        // Service (15) must end by the window end. B starts ≤ 200-15 = 185 → A starts ≤ 185-40-15 = 130
        // A latest start = min(120-15, 130) = 105 → depart P ≤ 105-30 = 75
        const stops = [stop('P', 'SHIP'), stop('A', 'TO', [null, 120]), stop('B', 'TO', [null, 200])]
        const r = latestFeasibleDeparture(stops, [leg(30), leg(40)])
        expect(r.latestDepartureAt).toEqual(at(75))
        expect(r.conflictKeys).toEqual([])
    })

    it('is bound by a downstream deadline when tighter', () => {
        // B starts ≤ 100-15 = 85 → A starts ≤ 85-40-15 = 30 → depart ≤ 0
        const stops = [stop('P', 'SHIP'), stop('A', 'TO', [null, 120]), stop('B', 'TO', [null, 100])]
        expect(latestFeasibleDeparture(stops, [leg(30), leg(40)]).latestDepartureAt).toEqual(at(0))
    })

    it('returns null when no stop has a window end', () => {
        const stops = [stop('P', 'SHIP'), stop('A', 'TO', [60, null])]
        expect(latestFeasibleDeparture(stops, [leg(30)]).latestDepartureAt).toBeNull()
    })

    it('flags a window that opens after a downstream deadline allows', () => {
        // A opens at +100, but B (deadline +110) needs A started by 110-15-40-15 = 40
        const stops = [stop('P', 'SHIP'), stop('A', 'TO', [100, 200]), stop('B', 'TO', [null, 110])]
        expect(latestFeasibleDeparture(stops, [leg(30), leg(40)]).conflictKeys).toEqual(['A'])
    })
})

describe('recommendDeparture', () => {
    const stops = [stop('P', 'SHIP'), stop('A', 'TO', [null, 120])]

    it('recommends the latest departure meeting all windows', () => {
        const r = recommendDeparture(stops, [leg(30)], at(0))
        expect(r).toMatchObject({ feasible: true, basis: 'LATEST_MEETING_WINDOWS' })
        expect(r.at).toEqual(at(75))
        const s = computeSchedule(stops, [leg(30)], r.at)
        expect(s[1].windowStatus).toBe('OK')
        expect(s[1].departureAt).toEqual(at(120))
    })

    it('EARLY arrives at the first window as it opens, without waiting', () => {
        const windowed = [stop('P', 'SHIP'), stop('A', 'TO', [60, 120]), stop('B', 'TO', [null, 300])]
        const r = recommendDeparture(windowed, [leg(30), leg(20)], at(0), 'EARLY')
        expect(r).toMatchObject({ feasible: true, basis: 'EARLIEST_MEETING_WINDOWS' })
        expect(r.at).toEqual(at(30))
        const s = computeSchedule(windowed, [leg(30), leg(20)], r.at)
        expect(s[1]).toMatchObject({ windowStatus: 'OK', waitSec: 0 })
        expect(s[1].arrivalAt).toEqual(at(60))
    })

    it('EARLY never departs before now', () => {
        const windowed = [stop('P', 'SHIP'), stop('A', 'TO', [60, 120])]
        const r = recommendDeparture(windowed, [leg(30)], at(45), 'EARLY')
        expect(r).toMatchObject({ feasible: true, basis: 'EARLIEST_MEETING_WINDOWS' })
        expect(r.at).toEqual(at(45))
    })

    it('EARLY without window starts departs now while deadlines still hold', () => {
        const r = recommendDeparture(stops, [leg(30)], at(0), 'EARLY')
        expect(r).toMatchObject({ feasible: true, basis: 'EARLIEST_MEETING_WINDOWS' })
        expect(r.at).toEqual(at(0))
    })

    it('falls back to now (infeasible) when the latest departure has passed', () => {
        const r = recommendDeparture(stops, [leg(30)], at(100))
        expect(r).toMatchObject({ feasible: false, basis: 'EARLIEST_PRACTICAL' })
        expect(r.at).toEqual(at(100))
        expect(computeSchedule(stops, [leg(30)], r.at)[1].windowStatus).toBe('LATE')
    })

    it('uses now when there are no deadlines', () => {
        const r = recommendDeparture([stop('P', 'SHIP'), stop('A', 'TO')], [leg(30)], new Date(T0.getTime() + 1_500))
        expect(r).toMatchObject({ feasible: true, basis: 'NO_DEADLINES' })
        expect(r.at).toEqual(at(1))
    })

    it('is infeasible when windows conflict regardless of departure', () => {
        const conflicting = [stop('P', 'SHIP'), stop('A', 'TO', [100, 200]), stop('B', 'TO', [null, 110])]
        expect(recommendDeparture(conflicting, [leg(30), leg(40)], at(0)).feasible).toBe(false)
    })
})
