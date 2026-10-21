import {
    computeOrderTracking,
    courierShopperEvent,
    isLastMile,
    stopsBefore,
    type OrderTrackingFacts,
    type TrackingCourierFacts,
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

describe('computeOrderTracking — courier (3PL) shipments', () => {
    const courier = (over: Partial<TrackingCourierFacts> = {}): TrackingCourierFacts => ({
        status: 'BOOKED',
        carrierName: 'J&T Express',
        trackingNumber: 'JT123',
        trackingUrl: 'https://jt.example/track/JT123',
        pickedUpAt: null,
        deliveredAt: null,
        events: [{ status: 'BOOKED', occurredAt: t(5) }],
        ...over,
    })
    const withCourier = (c: TrackingCourierFacts, shipmentStatus = 'READY') =>
        order({ packages: [pkg('READY_FOR_DISPATCH', { status: shipmentStatus, courier: c })] })

    it('booked with a courier → still Ready for delivery, courier block shown', () => {
        const r = computeOrderTracking(withCourier(courier()))
        expect(r.customerStatus).toBe('READY_FOR_DELIVERY')
        expect(r.courier).toMatchObject({
            carrierName: 'J&T Express',
            trackingNumber: 'JT123',
            trackingUrl: 'https://jt.example/track/JT123',
            statusLabel: 'Booked with courier',
        })
    })

    it('courier picked up → In transit at the pickup time, with the carrier named', () => {
        const f = withCourier(
            courier({
                status: 'PICKED_UP',
                pickedUpAt: t(6),
                events: [
                    { status: 'BOOKED', occurredAt: t(5) },
                    { status: 'PICKED_UP', occurredAt: t(6) },
                ],
            }),
            'DISPATCHED',
        )
        const r = computeOrderTracking(f)
        expect(r.customerStatus).toBe('IN_TRANSIT')
        expect(checkpoint(f, 'IN_TRANSIT')).toMatchObject({
            at: t(6).toISOString(),
            note: 'With J&T Express',
        })
        // Newest courier event first
        expect(r.courier?.events.map((e) => e.status)).toEqual(['PICKED_UP', 'BOOKED'])
    })

    it('out for delivery is called out on the In transit step', () => {
        const f = withCourier(
            courier({ status: 'OUT_FOR_DELIVERY', pickedUpAt: t(6) }),
            'IN_TRANSIT',
        )
        expect(checkpoint(f, 'IN_TRANSIT')?.note).toBe('Out for delivery with J&T Express')
    })

    it('courier delivered → Delivered at the courier delivery time', () => {
        const f = withCourier(
            courier({ status: 'DELIVERED', pickedUpAt: t(6), deliveredAt: t(9) }),
            'DELIVERED',
        )
        expect(statusOf(f)).toBe('DELIVERED')
        expect(checkpoint(f, 'DELIVERED')?.at).toBe(t(9).toISOString())
    })

    it('exception after pickup or a return → Delivery failed with a courier-safe note', () => {
        const exception = withCourier(
            courier({
                status: 'EXCEPTION',
                pickedUpAt: t(6),
                events: [{ status: 'EXCEPTION', occurredAt: t(8) }],
            }),
            'EXCEPTION_HOLD',
        )
        expect(statusOf(exception)).toBe('DELIVERY_FAILED')
        expect(checkpoint(exception, 'DELIVERY_FAILED')).toMatchObject({
            at: t(8).toISOString(),
            note: 'The courier reported a delivery issue',
        })
        const returned = withCourier(
            courier({ status: 'RETURNED', pickedUpAt: t(6) }),
            'RETURNED',
        )
        expect(checkpoint(returned, 'DELIVERY_FAILED')?.note).toBe(
            'The parcel is being returned to the seller',
        )
    })

    it('exception before pickup is not a failed delivery', () => {
        const f = withCourier(courier({ status: 'EXCEPTION' }), 'EXCEPTION_HOLD')
        expect(statusOf(f)).toBe('READY_FOR_DELIVERY')
    })

    it('a cancelled booking hides the courier block', () => {
        const r = computeOrderTracking(withCourier(courier({ status: 'CANCELLED' })))
        expect(r.courier).toBeNull()
        expect(r.customerStatus).toBe('READY_FOR_DELIVERY')
    })
})

describe('stopsBefore / isLastMile', () => {
    const stops = [
        { sequence: 1, status: 'COMPLETED' },
        { sequence: 2, status: 'ARRIVED' },
        { sequence: 3, status: 'PENDING' },
        { sequence: 4, status: 'PENDING' },
    ]

    it('counts the open stops ahead of the customer', () => {
        expect(stopsBefore(stops, 4)).toBe(2)
        expect(stopsBefore(stops, 2)).toBe(0)
        expect(isLastMile(stops, 4)).toBe(false)
        expect(isLastMile(stops, 2)).toBe(true)
    })

    it('treats failed and skipped stops as done (the truck will not go there)', () => {
        const settled = [
            { sequence: 1, status: 'FAILED' },
            { sequence: 2, status: 'SKIPPED' },
            { sequence: 3, status: 'PENDING' },
        ]
        expect(stopsBefore(settled, 3)).toBe(0)
        expect(isLastMile(settled, 3)).toBe(true)
    })
})

describe('courierShopperEvent', () => {
    it('maps courier moves onto the shopper notices', () => {
        expect(courierShopperEvent('PICKED_UP', true)).toBe('IN_TRANSIT')
        expect(courierShopperEvent('OUT_FOR_DELIVERY', true)).toBe('NEXT_STOP')
        expect(courierShopperEvent('DELIVERED', true)).toBe('DELIVERED')
        expect(courierShopperEvent('RETURNED', true)).toBe('DELIVERY_FAILED')
        expect(courierShopperEvent('EXCEPTION', true)).toBe('DELIVERY_FAILED')
    })

    it('stays quiet for booking-side moves', () => {
        expect(courierShopperEvent('EXCEPTION', false)).toBeNull()
        expect(courierShopperEvent('CANCELLED', false)).toBeNull()
        expect(courierShopperEvent('IN_TRANSIT', true)).toBeNull()
    })
})
