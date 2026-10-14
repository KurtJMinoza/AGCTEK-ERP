import {
    computeOrderTracking,
    type OrderTrackingFacts,
    type TrackingPackageFacts,
    type TrackingStopLink,
} from './order-tracking.rules'

const t = (h: number) => new Date(Date.UTC(2026, 9, 13, h))

function order(over: Partial<OrderTrackingFacts> = {}): OrderTrackingFacts {
    return {
        orderId: 'so-1',
        orderNumber: 'SO-1',
        status: 'CONFIRMED',
        createdAt: t(1),
        updatedAt: t(1),
        approvedAt: t(2),
        paidAt: null,
        pickingTasks: [],
        packages: [],
        ...over,
    }
}

function link(over: Partial<TrackingStopLink> = {}): TrackingStopLink {
    return {
        action: 'DROPOFF',
        stopStatus: 'PENDING',
        stopCompletedAt: null,
        stopFailedAt: null,
        failureCode: null,
        tripId: 'trip-1',
        tripStatus: 'DISPATCHED',
        tripStartedAt: null,
        tripCreatedAt: t(5),
        ...over,
    }
}

function pkg(
    status = 'READY_FOR_DISPATCH',
    shipment: Partial<NonNullable<TrackingPackageFacts['shipment']>> | null = {},
): TrackingPackageFacts {
    return {
        status,
        createdAt: t(3),
        updatedAt: t(4),
        shipment:
            shipment === null
                ? null
                : {
                      id: 'shp-1',
                      status: 'READY',
                      createdAt: t(4),
                      deliveredAt: null,
                      links: [],
                      ...shipment,
                  },
    }
}

const statusOf = (f: OrderTrackingFacts) => computeOrderTracking(f).customerStatus
const checkpoint = (f: OrderTrackingFacts, code: string) =>
    computeOrderTracking(f).checkpoints.find((c) => c.code === code)

describe('computeOrderTracking — departure hub label', () => {
    const pickup = (over: Partial<TrackingStopLink> = {}) =>
        link({ action: 'PICKUP', stopName: 'AGC Davao Warehouse', ...over })

    it('names the origin hub on In transit once the trip has started', () => {
        const f = order({
            packages: [
                pkg('DISPATCHED', {
                    links: [
                        pickup({ tripStatus: 'IN_TRANSIT', tripStartedAt: t(6) }),
                        link({ tripStatus: 'IN_TRANSIT', tripStartedAt: t(6) }),
                    ],
                }),
            ],
        })
        expect(checkpoint(f, 'IN_TRANSIT')).toMatchObject({
            done: true,
            note: 'Departed AGC Davao Warehouse',
        })
    })

    it('adds no hub note before the trip starts or for another trip', () => {
        const notStarted = order({
            packages: [pkg('DISPATCHED', { links: [pickup(), link()] })],
        })
        expect(checkpoint(notStarted, 'IN_TRANSIT')?.note).toBeUndefined()

        const otherTrip = order({
            packages: [
                pkg('DISPATCHED', {
                    links: [
                        pickup({ tripId: 'trip-old', tripStatus: 'CANCELLED' }),
                        link({ tripStatus: 'IN_TRANSIT', tripStartedAt: t(6) }),
                    ],
                }),
            ],
        })
        expect(checkpoint(otherTrip, 'IN_TRANSIT')?.note).toBeUndefined()
    })
})

describe('computeOrderTracking — customer status', () => {
    it('DRAFT order → Placed', () => {
        expect(statusOf(order({ status: 'DRAFT', approvedAt: null }))).toBe('PLACED')
    })

    it('confirmed, warehouse not started → Confirmed (at = approvedAt)', () => {
        const f = order()
        expect(statusOf(f)).toBe('CONFIRMED')
        expect(checkpoint(f, 'CONFIRMED')).toMatchObject({ done: true, current: true, at: t(2).toISOString() })
    })

    it('picking in progress → Preparing', () => {
        const f = order({
            pickingTasks: [{ status: 'ASSIGNED', pickedQty: 0, createdAt: t(2), updatedAt: t(3), completedAt: null }],
        })
        expect(statusOf(f)).toBe('PREPARING')
    })

    it('packed + shipment released, trip not started → Ready for delivery (NOT in transit)', () => {
        const f = order({ packages: [pkg('READY_FOR_DISPATCH', { links: [link({ tripStatus: 'DISPATCHED' })] })] })
        const r = computeOrderTracking(f)
        expect(r.customerStatus).toBe('READY_FOR_DELIVERY')
        expect(r.customerStatusLabel).toBe('Ready for delivery')
        expect(r.checkpoints.find((c) => c.code === 'IN_TRANSIT')).toMatchObject({ done: false, at: null })
    })

    it('goods issue posted (SO SHIPPED, package DISPATCHED) without Start Route → still not in transit', () => {
        const f = order({ status: 'SHIPPED', packages: [pkg('DISPATCHED', { status: 'DISPATCHED', links: [link()] })] })
        expect(statusOf(f)).toBe('READY_FOR_DELIVERY')
    })

    it('driver Start Route (trip IN_TRANSIT) → In transit, checkpoint time = trip.startedAt', () => {
        const f = order({
            packages: [pkg('DISPATCHED', { links: [link({ tripStatus: 'IN_TRANSIT', tripStartedAt: t(6) })] })],
        })
        const r = computeOrderTracking(f)
        expect(r.customerStatus).toBe('IN_TRANSIT')
        expect(r.customerStatusLabel).toBe('In transit')
        expect(r.checkpoints.find((c) => c.code === 'IN_TRANSIT')).toMatchObject({
            done: true,
            current: true,
            at: t(6).toISOString(),
        })
    })

    it('POD success (stop COMPLETED) → Delivered with stop completion time', () => {
        const f = order({
            packages: [
                pkg('DISPATCHED', {
                    links: [
                        link({
                            tripStatus: 'IN_TRANSIT',
                            tripStartedAt: t(6),
                            stopStatus: 'COMPLETED',
                            stopCompletedAt: t(8),
                        }),
                    ],
                }),
            ],
        })
        const r = computeOrderTracking(f)
        expect(r.customerStatus).toBe('DELIVERED')
        expect(r.checkpoints.at(-1)).toMatchObject({ code: 'DELIVERED', current: true, at: t(8).toISOString() })
        expect(r.checkpoints.every((c) => c.done)).toBe(true)
    })

    it('stop FAILED → Delivery failed with a customer-safe reason', () => {
        const f = order({
            packages: [
                pkg('DISPATCHED', {
                    status: 'EXCEPTION_HOLD',
                    links: [
                        link({
                            tripStatus: 'IN_TRANSIT',
                            tripStartedAt: t(6),
                            stopStatus: 'FAILED',
                            stopFailedAt: t(7),
                            failureCode: 'CUSTOMER_UNAVAILABLE',
                        }),
                    ],
                }),
            ],
        })
        const r = computeOrderTracking(f)
        expect(r.customerStatus).toBe('DELIVERY_FAILED')
        expect(r.checkpoints.at(-1)).toMatchObject({
            code: 'DELIVERY_FAILED',
            at: t(7).toISOString(),
            note: 'Recipient was not available',
        })
    })

    it('re-attempt on a new trip overrides an earlier failed attempt', () => {
        const f = order({
            packages: [
                pkg('DISPATCHED', {
                    links: [
                        link({ tripId: 'old', tripStatus: 'COMPLETED', stopStatus: 'FAILED', tripCreatedAt: t(5) }),
                        link({ tripId: 'new', tripStatus: 'IN_TRANSIT', tripStartedAt: t(9), tripCreatedAt: t(8) }),
                    ],
                }),
            ],
        })
        expect(statusOf(f)).toBe('IN_TRANSIT')
    })

    it('cancelled trip links are ignored', () => {
        const f = order({ packages: [pkg('READY_FOR_DISPATCH', { links: [link({ tripStatus: 'CANCELLED' })] })] })
        expect(statusOf(f)).toBe('READY_FOR_DELIVERY')
    })

    it('cancelled order → Cancelled; only reached steps are listed', () => {
        const r = computeOrderTracking(order({ status: 'CANCELLED', updatedAt: t(3) }))
        expect(r.customerStatus).toBe('CANCELLED')
        expect(r.checkpoints.map((c) => c.code)).toEqual(['PLACED', 'CONFIRMED', 'CANCELLED'])
    })

    it('missing event timestamps are null, never invented', () => {
        const r = computeOrderTracking(order({ approvedAt: null }))
        expect(r.checkpoints.find((c) => c.code === 'CONFIRMED')?.at).toBeNull()
        expect(r.checkpoints.find((c) => c.code === 'DELIVERED')).toMatchObject({ done: false, at: null })
    })
})
