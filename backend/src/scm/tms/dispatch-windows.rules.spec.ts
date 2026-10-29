import { dispatchWindowIssues, type DispatchWindowStop } from './dispatch-windows.rules'

const NOW = new Date('2026-10-17T08:00:00Z')
const at = (min: number) => new Date(NOW.getTime() + min * 60_000)

/** Hub → two customers ~7 km apart each (~11 min at 40 km/h) → back to hub. */
function stops(over: Partial<Record<number, Partial<DispatchWindowStop>>> = {}): DispatchWindowStop[] {
    const base: DispatchWindowStop[] = [
        { sequence: 1, stopType: 'SHIP', lat: 14.6, lng: 120.98, windowStart: null, windowEnd: null },
        { sequence: 2, stopType: 'TO', lat: 14.55, lng: 121.02, windowStart: null, windowEnd: null },
        { sequence: 3, stopType: 'TO', lat: 14.5, lng: 121.06, windowStart: null, windowEnd: null },
        { sequence: 4, stopType: 'RETURN', lat: 14.6, lng: 120.98, windowStart: null, windowEnd: null },
    ]
    return base.map((s) => ({ ...s, ...over[s.sequence] }))
}

describe('dispatchWindowIssues', () => {
    it('skips trips without windows', () => {
        expect(dispatchWindowIssues(stops(), null, NOW)).toEqual([])
    })

    it('skips when a stop has no coordinates (stop-location validation owns that)', () => {
        const s = stops({ 2: { windowEnd: at(5), lat: null } })
        expect(dispatchWindowIssues(s, null, NOW)).toEqual([])
    })

    it('passes when every window is reachable from now', () => {
        const s = stops({ 2: { windowEnd: at(120) }, 3: { windowEnd: at(180) } })
        expect(dispatchWindowIssues(s, null, NOW)).toEqual([])
    })

    it('flags a stop finishing service after its window closes', () => {
        const s = stops({ 2: { windowEnd: at(20) } })
        const issues = dispatchWindowIssues(s, null, NOW)
        expect(issues).toHaveLength(1)
        expect(issues[0]).toMatch(/^stop #2: about \d+ min after its window closes$/)
    })

    it('departs at the planned start when it is later than now', () => {
        const s = stops({ 2: { windowEnd: at(120) } })
        expect(dispatchWindowIssues(s, null, NOW)).toEqual([])
        expect(dispatchWindowIssues(s, at(110), NOW)[0]).toMatch(/stop #2/)
    })

    it('flags a window that opens too late for a later stop (no departure fixes it)', () => {
        const s = stops({ 2: { windowStart: at(240) }, 3: { windowEnd: at(120) } })
        const issues = dispatchWindowIssues(s, null, NOW)
        expect(issues).toContain('stop #2: window opens too late for later deliveries')
    })

    it('return stop has no service time', () => {
        // Leg 3→4 is ~14 km (~21 min); with zero dwell at RETURN the deadline is met.
        const s = stops({ 4: { windowEnd: at(11 + 30 + 11 + 30 + 25) } })
        expect(dispatchWindowIssues(s, null, NOW)).toEqual([])
    })
})
