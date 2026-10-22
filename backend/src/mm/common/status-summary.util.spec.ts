/**
 * The Inventory Management pages show summary tiles that must describe the
 * whole filter, not the rows on screen. Every list endpoint therefore
 * answers with a server-side status breakdown.
 */
import { toStatusCounts } from './status-summary.util'

describe('toStatusCounts', () => {
    it('maps a Prisma groupBy result into status counts', () => {
        const rows = [
            { status: 'POSTED', _count: { _all: 4 } },
            { status: 'DRAFT', _count: { _all: 7 } },
        ]

        expect(toStatusCounts(rows)).toEqual([
            { status: 'DRAFT', count: 7 },
            { status: 'POSTED', count: 4 },
        ])
    })

    it('returns an empty list when nothing matches', () => {
        expect(toStatusCounts([])).toEqual([])
    })

    it('keeps zero-count statuses out of the way but still lists them', () => {
        const rows = [{ status: 'CANCELLED', _count: { _all: 0 } }]
        expect(toStatusCounts(rows)).toEqual([{ status: 'CANCELLED', count: 0 }])
    })
})
