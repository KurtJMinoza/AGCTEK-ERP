import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { RetailSessionService } from '../retail/retail-session.service'
import {
    TRIP_EVENTS,
    type TripStartedEvent,
    type TripStopSettledEvent,
} from '../scm/trips/trip-events'
import {
    isLastMile,
    shopperTrackingNotice,
    type ShopperTrackingEvent,
} from './order-tracking.rules'

const OPEN_STOP = new Set(['PENDING', 'ARRIVED'])

/**
 * Notifies storefront shoppers as their delivery progresses (SCM trip events →
 * SD orders). Each notice links to the signed public tracking page and is
 * deduplicated per order / event / trip-or-stop, so retries never double-post.
 * Only orders owned by a `RetailClient` are notified.
 */
@Injectable()
export class OrderTrackingNotifierListener {
    private readonly logger = new Logger(OrderTrackingNotifierListener.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationsService,
        private readonly retailSessions: RetailSessionService,
    ) {}

    @OnEvent(TRIP_EVENTS.STARTED)
    async onTripStarted(payload: TripStartedEvent) {
        await this.safely('trip.started', async () => {
            const shipmentIds = await this.dropoffShipmentIds(payload.tripId)
            await this.notifyOrders(shipmentIds, 'IN_TRANSIT', payload.tripId)
            await this.notifyNextStop(payload.tripId)
        })
    }

    @OnEvent(TRIP_EVENTS.STOP_COMPLETED)
    async onStopCompleted(payload: TripStopSettledEvent) {
        await this.safely('trip.stop.completed', async () => {
            await this.notifyOrders(payload.shipmentIds, 'DELIVERED', payload.stopId)
            await this.notifyNextStop(payload.tripId)
        })
    }

    @OnEvent(TRIP_EVENTS.STOP_FAILED)
    async onStopFailed(payload: TripStopSettledEvent) {
        await this.safely('trip.stop.failed', async () => {
            await this.notifyOrders(
                payload.shipmentIds,
                'DELIVERY_FAILED',
                payload.stopId,
                payload.failureCode,
            )
            await this.notifyNextStop(payload.tripId)
        })
    }

    private async safely(event: string, work: () => Promise<void>) {
        try {
            await work()
        } catch (error) {
            this.logger.warn(
                `Shopper notification for ${event} failed: ${(error as Error).message}`,
            )
        }
    }

    private async dropoffShipmentIds(tripId: string): Promise<string[]> {
        const links = await this.prisma.tripStopShipment.findMany({
            where: { action: 'DROPOFF', tripStop: { tripId } },
            select: { shipmentId: true },
        })
        return links.map((l) => l.shipmentId)
    }

    /**
     * First open drop-off stop of an in-transit trip, once every earlier stop
     * (incl. the warehouse load) is settled — same rule as the map's last mile.
     */
    private async notifyNextStop(tripId: string) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            select: {
                status: true,
                stops: {
                    orderBy: { sequence: 'asc' },
                    select: {
                        id: true,
                        sequence: true,
                        status: true,
                        shipments: {
                            where: { action: 'DROPOFF' },
                            select: { shipmentId: true },
                        },
                    },
                },
            },
        })
        if (trip?.status !== 'IN_TRANSIT') return
        const next = trip.stops.find(
            (s) => OPEN_STOP.has(s.status) && s.shipments.length > 0,
        )
        if (!next || !isLastMile(trip.stops, next.sequence)) return
        await this.notifyOrders(
            next.shipments.map((s) => s.shipmentId),
            'NEXT_STOP',
            next.id,
        )
    }

    private async notifyOrders(
        shipmentIds: string[],
        event: ShopperTrackingEvent,
        scopeId: string,
        failureCode?: string | null,
    ) {
        if (shipmentIds.length === 0) return
        const packages = await this.prisma.wmPackage.findMany({
            where: { shipment: { id: { in: shipmentIds } } },
            select: { salesOrderId: true, pickingTask: { select: { salesOrderId: true } } },
        })
        const orderIds = [
            ...new Set(
                packages
                    .map((p) => p.salesOrderId ?? p.pickingTask?.salesOrderId)
                    .filter((id): id is string => !!id),
            ),
        ]
        if (orderIds.length === 0) return

        const orders = await this.prisma.sdSalesOrder.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNumber: true, customerId: true },
        })
        const shoppers = new Set(
            (
                await this.prisma.retailClient.findMany({
                    where: { id: { in: orders.map((o) => o.customerId) } },
                    select: { id: true },
                })
            ).map((c) => c.id),
        )

        for (const order of orders) {
            if (!shoppers.has(order.customerId)) continue
            const notice = shopperTrackingNotice({
                event,
                orderId: order.id,
                orderNumber: order.orderNumber,
                scopeId,
                failureCode,
            })
            const { token } = this.retailSessions.issueTrackingLink(order.id)
            await this.notifications.createForShopper({
                retailClientId: order.customerId,
                ...notice,
                location: `/shop/track/${encodeURIComponent(token)}`,
                locationLabel: 'Track order',
            })
        }
    }
}
