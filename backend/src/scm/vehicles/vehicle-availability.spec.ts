import { tripOverlapsWindow, type TripWindowLike } from './vehicle-availability'

const at = (hour: number) => new Date(Date.UTC(2026, 10, 20, hour, 0, 0))

function trip(overrides: Partial<TripWindowLike> = {}): TripWindowLike {
    return {
        status: 'ASSIGNED',
        plannedStartAt: at(9),
        plannedEndAt: at(12),
        startedAt: null,
        ...overrides,
    }
}

describe('tripOverlapsWindow', () => {
    it('overlaps when the windows intersect', () => {
        expect(tripOverlapsWindow(trip(), at(11), at(13))).toBe(true)
        expect(tripOverlapsWindow(trip(), at(8), at(10))).toBe(true)
        expect(tripOverlapsWindow(trip(), at(10), at(11))).toBe(true)
    })

    it('does not overlap when windows only touch at the boundary', () => {
        expect(tripOverlapsWindow(trip(), at(12), at(14))).toBe(false)
        expect(tripOverlapsWindow(trip(), at(7), at(9))).toBe(false)
    })

    it('assumes a 12h run when the trip has a start but no planned end', () => {
        const open = trip({ plannedEndAt: null })
        expect(tripOverlapsWindow(open, at(20), at(22))).toBe(true)
        expect(tripOverlapsWindow(open, new Date(at(9).getTime() + 13 * 3600_000), new Date(at(9).getTime() + 15 * 3600_000))).toBe(false)
    })

    it('treats an in-transit trip without an end as occupying the vehicle until completed', () => {
        const live = trip({ status: 'IN_TRANSIT', plannedEndAt: null, startedAt: at(9) })
        expect(tripOverlapsWindow(live, new Date(Date.UTC(2026, 11, 1)), new Date(Date.UTC(2026, 11, 2)))).toBe(true)
    })

    it('blocks the vehicle for an unscheduled reserving trip (conservative)', () => {
        expect(
            tripOverlapsWindow(trip({ plannedStartAt: null, plannedEndAt: null }), at(1), at(2)),
        ).toBe(true)
    })
})
