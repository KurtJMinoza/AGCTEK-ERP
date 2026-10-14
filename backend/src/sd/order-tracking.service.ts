import {
    Inject,
    Injectable,
    NotFoundException,
    UnauthorizedException,
    forwardRef,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { TrackingService } from '../scm/tracking/tracking.service'
import { RetailSessionService } from '../retail/retail-session.service'
import {
    publicTrackingPolicy,
    toPublicMap,
} from '../scm/tracking/public-position.rules'
import {
    computeOrderTracking,
    isLastMile,
    type OrderTrackingDto,
    type TrackingPackageFacts,
} from './order-tracking.rules'

const packageSelect = {
    salesOrderId: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    pickingTask: { select: { salesOrderId: true } },
    shipment: {
        select: {
            id: true,
            status: true,
            createdAt: true,
            deliveredAt: true,
            tripStopShipments: {
                select: {
                    action: true,
                    tripStop: {
                        select: {
                            name: true,
                            status: true,
                            completedAt: true,
                            failedAt: true,
                            failureCode: true,
                            trip: {
                                select: { id: true, status: true, startedAt: true, createdAt: true },
                            },
                        },
                    },
                },
            },
        },
    },
} satisfies Prisma.WmPackageSelect

type PackageRow = Prisma.WmPackageGetPayload<{ select: typeof packageSelect }>

const MAX_BATCH = 100

/**
 * Builds the customer tracking timeline for storefront orders. Reads SD order,
 * MM picking / packages and SCM shipment → trip stop → trip; owns no state.
 * Ownership: a retail client only ever sees their own orders.
 */
@Injectable()
export class OrderTrackingService {
    constructor(
        private readonly prisma: PrismaService,
        @Inject(forwardRef(() => TrackingService))
        private readonly tracking: TrackingService,
        private readonly retailSessions: RetailSessionService,
    ) {}

    async buildForCustomer(
        orderId: string,
        clientId: string | null,
        now: Date = new Date(),
    ): Promise<OrderTrackingDto> {
        if (!clientId) throw new UnauthorizedException('Please sign in to track your order')
        const [result] = await this.buildMany([orderId], clientId)
        if (!result) throw new NotFoundException('Order not found')
        return this.withDeliveryMap(result, now)
    }

    /**
     * Adds the drop-off pin and the delayed vehicle position. The map is on
     * only while the customer status is IN_TRANSIT; staff live tracking is
     * untouched and no vehicle / plate / device identity is returned.
     */
    private async withDeliveryMap(
        dto: OrderTrackingDto,
        now: Date,
    ): Promise<OrderTrackingDto> {
        const link = await this.prisma.tripStopShipment.findFirst({
            where: {
                action: 'DROPOFF',
                tripStop: { trip: { status: { not: 'CANCELLED' } } },
                shipment: {
                    package: {
                        OR: [
                            { salesOrderId: dto.orderId },
                            { salesOrderId: null, pickingTask: { salesOrderId: dto.orderId } },
                        ],
                    },
                },
            },
            orderBy: { tripStop: { trip: { createdAt: 'desc' } } },
            select: {
                shipment: { select: { destLat: true, destLng: true } },
                tripStop: {
                    select: {
                        sequence: true,
                        lat: true,
                        lng: true,
                        trip: {
                            select: {
                                id: true,
                                status: true,
                                stops: { select: { sequence: true, status: true } },
                            },
                        },
                    },
                },
            },
        })

        const policy = publicTrackingPolicy()
        if (!link) {
            return {
                ...dto,
                map: toPublicMap({
                    inTransit: false,
                    point: null,
                    delaySeconds: policy.delaySeconds,
                    lastMile: false,
                    staleSeconds: policy.staleSeconds,
                    now,
                }),
            }
        }

        const lat = link.tripStop.lat ?? link.shipment.destLat
        const lng = link.tripStop.lng ?? link.shipment.destLng
        const destination =
            lat != null && lng != null ? { lat, lng, label: 'Delivery address' } : null

        const trip = link.tripStop.trip
        const inTransit = dto.customerStatus === 'IN_TRANSIT' && trip.status === 'IN_TRANSIT'
        const lastMile = inTransit && isLastMile(trip.stops, link.tripStop.sequence)
        const delaySeconds = lastMile ? policy.lastMileDelaySeconds : policy.delaySeconds
        const point = inTransit
            ? await this.tracking.publicPositionForTrip(trip.id, { delaySeconds, now })
            : null

        const map = toPublicMap({
            inTransit,
            point,
            delaySeconds,
            lastMile,
            staleSeconds: policy.staleSeconds,
            now,
        })
        if (map.available && point) {
            map.eta = await this.tracking
                .publicEtaForStop(trip.id, link.tripStop.sequence, point, now)
                .catch(() => null)
        }
        return { ...dto, destination, map }
    }

    /** Batch for the My Orders list; ids not owned by the client are silently dropped. */
    async buildManyForCustomer(orderIds: string[], clientId: string | null) {
        if (!clientId) throw new UnauthorizedException('Please sign in to track your orders')
        return this.buildMany([...new Set(orderIds)].slice(0, MAX_BATCH), clientId)
    }

    /**
     * Shareable link for SMS / email / "copy link". Only the owner can mint
     * one; the token carries the order id only and cannot sign anyone in.
     */
    async issueTrackingLink(orderId: string, clientId: string | null) {
        if (!clientId) throw new UnauthorizedException('Please sign in to share tracking')
        const owned = await this.prisma.sdSalesOrder.findFirst({
            where: { id: orderId, customerId: clientId },
            select: { id: true },
        })
        if (!owned) throw new NotFoundException('Order not found')
        return this.retailSessions.issueTrackingLink(owned.id)
    }

    /**
     * Read-only tracking via signed link (no sign-in). Same timeline and
     * delayed map; the drop-off pin is coarsened since links can be forwarded.
     */
    async buildForTrackingLink(token: string, now: Date = new Date()): Promise<OrderTrackingDto> {
        const orderId = this.retailSessions.verifyTrackingLink(token)
        const [result] = await this.buildMany([orderId], null)
        if (!result) throw new NotFoundException('Order not found')
        const dto = await this.withDeliveryMap(result, now)
        return {
            ...dto,
            destination: dto.destination
                ? {
                      lat: coarsen(dto.destination.lat),
                      lng: coarsen(dto.destination.lng),
                      label: 'Delivery area',
                  }
                : null,
        }
    }

    /** `clientId` null = already authorized by a signed link (never from a request param). */
    private async buildMany(
        orderIds: string[],
        clientId: string | null,
    ): Promise<OrderTrackingDto[]> {
        if (orderIds.length === 0) return []
        const orders = await this.prisma.sdSalesOrder.findMany({
            where: {
                id: { in: orderIds },
                ...(clientId != null ? { customerId: clientId } : {}),
            },
            select: {
                id: true,
                orderNumber: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                approvedAt: true,
                payments: { select: { paidAt: true } },
                pickingTasks: {
                    select: {
                        status: true,
                        pickedQty: true,
                        createdAt: true,
                        updatedAt: true,
                        completedAt: true,
                    },
                },
            },
        })
        if (orders.length === 0) return []
        const ids = orders.map((o) => o.id)

        // Direct SD link, plus legacy packages linked only via the picking task.
        const packages = await this.prisma.wmPackage.findMany({
            where: {
                OR: [
                    { salesOrderId: { in: ids } },
                    { salesOrderId: null, pickingTask: { salesOrderId: { in: ids } } },
                ],
            },
            select: packageSelect,
        })
        const byOrder = new Map<string, TrackingPackageFacts[]>()
        for (const p of packages) {
            const soId = p.salesOrderId ?? p.pickingTask?.salesOrderId
            if (!soId) continue
            const list = byOrder.get(soId) ?? []
            list.push(toPackageFacts(p))
            byOrder.set(soId, list)
        }

        const byId = new Map(
            orders.map((o) => [
                o.id,
                computeOrderTracking({
                    orderId: o.id,
                    orderNumber: o.orderNumber,
                    status: o.status,
                    createdAt: o.createdAt,
                    updatedAt: o.updatedAt,
                    approvedAt: o.approvedAt,
                    paidAt:
                        o.payments
                            .map((p) => p.paidAt)
                            .filter((d): d is Date => d != null)
                            .sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
                    pickingTasks: o.pickingTasks.map((t) => ({
                        ...t,
                        pickedQty: Number(t.pickedQty),
                    })),
                    packages: byOrder.get(o.id) ?? [],
                }),
            ]),
        )
        return orderIds.map((id) => byId.get(id)).filter((d): d is OrderTrackingDto => !!d)
    }
}

/** ~110 m grid: enough to show the area, not the exact door. */
const coarsen = (value: number) => Math.round(value * 1000) / 1000

function toPackageFacts(p: PackageRow): TrackingPackageFacts {
    return {
        status: p.status,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        shipment: p.shipment
            ? {
                  id: p.shipment.id,
                  status: p.shipment.status,
                  createdAt: p.shipment.createdAt,
                  deliveredAt: p.shipment.deliveredAt,
                  links: p.shipment.tripStopShipments.map((l) => ({
                      action: l.action,
                      stopStatus: l.tripStop.status,
                      stopCompletedAt: l.tripStop.completedAt,
                      stopFailedAt: l.tripStop.failedAt,
                      failureCode: l.tripStop.failureCode,
                      tripId: l.tripStop.trip.id,
                      tripStatus: l.tripStop.trip.status,
                      tripStartedAt: l.tripStop.trip.startedAt,
                      tripCreatedAt: l.tripStop.trip.createdAt,
                      stopName: l.tripStop.name,
                  })),
              }
            : null,
    }
}
