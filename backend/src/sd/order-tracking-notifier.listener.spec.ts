import { OrderTrackingNotifierListener } from './order-tracking-notifier.listener'
import { shopperTrackingNotice } from './order-tracking.rules'

describe('shopperTrackingNotice', () => {
    it('keys dedupe by order, event and trip/stop scope', () => {
        const a = shopperTrackingNotice({
            event: 'IN_TRANSIT',
            orderId: 'so1',
            orderNumber: 'SO-1',
            scopeId: 'trip1',
        })
        expect(a.dedupeKey).toBe('order-tracking:so1:IN_TRANSIT:trip1')
        expect(a.message).toContain('SO-1')
    })

    it('uses the customer-safe failure reason, never the raw code', () => {
        const n = shopperTrackingNotice({
            event: 'DELIVERY_FAILED',
            orderId: 'so1',
            orderNumber: 'SO-1',
            scopeId: 'stop1',
            failureCode: 'CUSTOMER_UNAVAILABLE',
        })
        expect(n.message).toBe('Order SO-1: Recipient was not available.')
        expect(n.message).not.toContain('CUSTOMER_UNAVAILABLE')
    })
})

describe('OrderTrackingNotifierListener', () => {
    const build = () => {
        const prisma = {
            tripStopShipment: {
                findMany: jest.fn().mockResolvedValue([{ shipmentId: 'sh1' }, { shipmentId: 'sh2' }]),
            },
            trip: { findUnique: jest.fn() },
            wmPackage: {
                findMany: jest.fn().mockResolvedValue([
                    { salesOrderId: 'so1', pickingTask: null },
                    { salesOrderId: null, pickingTask: { salesOrderId: 'so2' } },
                ]),
            },
            sdSalesOrder: {
                findMany: jest.fn().mockResolvedValue([
                    { id: 'so1', orderNumber: 'SO-1', customerId: 'shopper1' },
                    { id: 'so2', orderNumber: 'SO-2', customerId: 'crm-customer' },
                ]),
            },
            retailClient: { findMany: jest.fn().mockResolvedValue([{ id: 'shopper1' }]) },
        }
        const notifications = { createForShopper: jest.fn().mockResolvedValue(null) }
        const sessions = {
            issueTrackingLink: jest.fn((id: string) => ({ token: `tok-${id}`, expiresAt: 'x' })),
        }
        const listener = new OrderTrackingNotifierListener(
            prisma as never,
            notifications as never,
            sessions as never,
        )
        return { listener, prisma, notifications, sessions }
    }

    it('notifies only shopper-owned orders on trip start, with a signed tracking link', async () => {
        const { listener, prisma, notifications } = build()
        prisma.trip.findUnique.mockResolvedValue({ status: 'IN_TRANSIT', stops: [] })

        await listener.onTripStarted({ tripId: 'trip1' })

        expect(notifications.createForShopper).toHaveBeenCalledTimes(1)
        expect(notifications.createForShopper).toHaveBeenCalledWith(
            expect.objectContaining({
                retailClientId: 'shopper1',
                dedupeKey: 'order-tracking:so1:IN_TRANSIT:trip1',
                location: '/shop/track/tok-so1',
            }),
        )
    })

    it('tells the first open drop-off stop it is next after a delivery', async () => {
        const { listener, prisma, notifications } = build()
        prisma.trip.findUnique.mockResolvedValue({
            status: 'IN_TRANSIT',
            stops: [
                { id: 'stopL', sequence: 1, status: 'COMPLETED', shipments: [] },
                { id: 'stopA', sequence: 2, status: 'COMPLETED', shipments: [{ shipmentId: 'sh0' }] },
                { id: 'stopB', sequence: 3, status: 'PENDING', shipments: [{ shipmentId: 'sh1' }] },
                { id: 'stopR', sequence: 4, status: 'PENDING', shipments: [] },
            ],
        })

        await listener.onStopCompleted({ tripId: 'trip1', stopId: 'stopA', shipmentIds: ['sh0'] })

        const keys = notifications.createForShopper.mock.calls.map((c) => c[0].dedupeKey)
        expect(keys).toEqual([
            'order-tracking:so1:DELIVERED:stopA',
            'order-tracking:so1:NEXT_STOP:stopB',
        ])
        expect(prisma.wmPackage.findMany).toHaveBeenLastCalledWith(
            expect.objectContaining({ where: { shipment: { id: { in: ['sh1'] } } } }),
        )
    })

    it('does not say "you\'re next" while the warehouse load stop is still open', async () => {
        const { listener, prisma, notifications } = build()
        prisma.trip.findUnique.mockResolvedValue({
            status: 'IN_TRANSIT',
            stops: [
                { id: 'stopL', sequence: 1, status: 'PENDING', shipments: [] },
                { id: 'stopB', sequence: 2, status: 'PENDING', shipments: [{ shipmentId: 'sh1' }] },
            ],
        })

        await listener.onTripStarted({ tripId: 'trip1' })

        const keys = notifications.createForShopper.mock.calls.map((c) => c[0].dedupeKey)
        expect(keys).toEqual(['order-tracking:so1:IN_TRANSIT:trip1'])
    })

    it('skips next-stop when the trip is no longer in transit and never throws', async () => {
        const { listener, prisma, notifications } = build()
        prisma.trip.findUnique.mockResolvedValue({ status: 'COMPLETED', stops: [] })
        await listener.onStopFailed({
            tripId: 'trip1',
            stopId: 'stopZ',
            shipmentIds: ['sh1'],
            failureCode: 'WRONG_ADDRESS',
        })
        expect(notifications.createForShopper).toHaveBeenCalledTimes(1)

        prisma.wmPackage.findMany.mockRejectedValue(new Error('db down'))
        await expect(
            listener.onStopCompleted({ tripId: 't', stopId: 's', shipmentIds: ['x'] }),
        ).resolves.toBeUndefined()
    })
})
