/**
 * Storefront order tracking — pure mapping from fulfillment facts to ONE
 * customer-facing status + timeline. No Prisma here so it is unit-testable.
 *
 * Hard rule: IN_TRANSIT comes only from trip.status === 'IN_TRANSIT' (driver
 * Start Route) or, for courier (3PL) shipments, from the courier having the
 * parcel (PICKED_UP / IN_TRANSIT / OUT_FOR_DELIVERY). Goods issue / SO status
 * SHIPPED / package DISPATCHED never imply "in transit".
 */

import type { PublicMapDto } from '../scm/tracking/public-position.rules'

export const CUSTOMER_STATUSES = [
    'PLACED',
    'CONFIRMED',
    'PREPARING',
    'READY_FOR_DELIVERY',
    'IN_TRANSIT',
    'DELIVERED',
    'DELIVERY_FAILED',
    'CANCELLED',
] as const

export type CustomerOrderStatus = (typeof CUSTOMER_STATUSES)[number]

export const CUSTOMER_STATUS_LABEL: Record<CustomerOrderStatus, string> = {
    PLACED: 'Placed',
    CONFIRMED: 'Confirmed',
    PREPARING: 'Preparing',
    READY_FOR_DELIVERY: 'Ready for delivery',
    IN_TRANSIT: 'In transit',
    DELIVERED: 'Delivered',
    DELIVERY_FAILED: 'Delivery failed',
    CANCELLED: 'Cancelled',
}

/** Customer-safe wording for driver failure codes (internal notes are never exposed). */
const PUBLIC_FAILURE_REASON: Record<string, string> = {
    CUSTOMER_UNAVAILABLE: 'Recipient was not available',
    CUSTOMER_REFUSED: 'Delivery was declined',
    WRONG_ADDRESS: 'Address could not be located',
    DAMAGED_GOODS: 'Parcel was damaged in transit',
    VEHICLE_ISSUE: 'Courier vehicle issue',
    PAYMENT_ISSUE: 'Payment could not be completed',
    OTHER: 'Delivery attempt was unsuccessful',
}

export function publicFailureReason(code: string | null | undefined): string {
    return PUBLIC_FAILURE_REASON[code ?? 'OTHER'] ?? PUBLIC_FAILURE_REASON.OTHER
}

export type ShopperTrackingEvent = 'IN_TRANSIT' | 'NEXT_STOP' | 'DELIVERED' | 'DELIVERY_FAILED'

/**
 * Shopper notification copy + idempotency key. `scopeId` is the trip (IN_TRANSIT)
 * or stop (others) so a re-attempt on a later trip notifies again, a retry doesn't.
 */
export function shopperTrackingNotice(input: {
    event: ShopperTrackingEvent
    orderId: string
    orderNumber: string
    scopeId: string
    failureCode?: string | null
}): { title: string; message: string; dedupeKey: string } {
    const { event, orderId, orderNumber, scopeId } = input
    const dedupeKey = `order-tracking:${orderId}:${event}:${scopeId}`
    switch (event) {
        case 'IN_TRANSIT':
            return {
                title: 'Your order is on the way',
                message: `Order ${orderNumber} is in transit. Tap to track it.`,
                dedupeKey,
            }
        case 'NEXT_STOP':
            return {
                title: "Out for delivery — you're next",
                message: `The courier is heading to you with order ${orderNumber}.`,
                dedupeKey,
            }
        case 'DELIVERED':
            return {
                title: 'Order delivered',
                message: `Order ${orderNumber} has been delivered.`,
                dedupeKey,
            }
        case 'DELIVERY_FAILED':
            return {
                title: 'Delivery attempt unsuccessful',
                message: `Order ${orderNumber}: ${publicFailureReason(input.failureCode)}.`,
                dedupeKey,
            }
    }
}

/**
 * Shopper notice for a courier status move; null = no notice (booking-side
 * changes, or a repeat of "in transit"). Scope is the consignment, so each
 * notice is sent once per hand-off.
 */
export function courierShopperEvent(
    status: string,
    pickedUp: boolean,
): ShopperTrackingEvent | null {
    switch (status) {
        case 'PICKED_UP':
            return 'IN_TRANSIT'
        case 'OUT_FOR_DELIVERY':
            return 'NEXT_STOP'
        case 'DELIVERED':
            return 'DELIVERED'
        case 'RETURNED':
            return 'DELIVERY_FAILED'
        case 'EXCEPTION':
            return pickedUp ? 'DELIVERY_FAILED' : null
        default:
            return null
    }
}

export type TrackingStopLink = {
    /** DROPOFF links decide delivery; PICKUP / RETURN are ignored */
    action: string
    stopStatus: string
    stopCompletedAt: Date | null
    stopFailedAt: Date | null
    failureCode: string | null
    tripId: string
    tripStatus: string
    tripStartedAt: Date | null
    tripCreatedAt: Date
    /** Stop display name (PICKUP = origin warehouse / hub) */
    stopName?: string | null
}

/** Third-party courier hand-off (SCM CourierConsignment) — docs/SCM_COURIERS.md. */
export type TrackingCourierFacts = {
    status: string
    carrierName: string
    trackingNumber: string | null
    trackingUrl: string | null
    pickedUpAt: Date | null
    deliveredAt: Date | null
    /** Status history; dispatcher notes are internal and never passed here. */
    events: Array<{ status: string; occurredAt: Date }>
}

export type TrackingShipmentFacts = {
    id: string
    status: string
    createdAt: Date
    deliveredAt: Date | null
    links: TrackingStopLink[]
    courier?: TrackingCourierFacts | null
}

export type TrackingPackageFacts = {
    status: string
    createdAt: Date
    updatedAt: Date
    shipment: TrackingShipmentFacts | null
}

export type TrackingPickFacts = {
    status: string
    pickedQty: number
    createdAt: Date
    updatedAt: Date
    completedAt: Date | null
}

export type OrderTrackingFacts = {
    orderId: string
    orderNumber: string
    status: string
    createdAt: Date
    updatedAt: Date
    approvedAt: Date | null
    paidAt: Date | null
    pickingTasks: TrackingPickFacts[]
    packages: TrackingPackageFacts[]
}

export type TrackingCheckpoint = {
    code: CustomerOrderStatus
    label: string
    at: string | null
    done: boolean
    current: boolean
    /** Only on DELIVERY_FAILED — customer-safe reason */
    note?: string | null
}

export type CourierTrackingDto = {
    carrierName: string
    trackingNumber: string | null
    /** Courier's public tracking page, when the carrier has a link template */
    trackingUrl: string | null
    status: string
    statusLabel: string
    /** Newest first */
    events: Array<{ status: string; label: string; at: string }>
}

export type OrderTrackingDto = {
    orderId: string
    orderNumber: string
    customerStatus: CustomerOrderStatus
    customerStatusLabel: string
    checkpoints: TrackingCheckpoint[]
    /** Set when the order ships with a third-party courier (no live map for these). */
    courier: CourierTrackingDto | null
    /**
     * Own-fleet stops still ahead of the customer's stop; only while the trip is
     * in transit (single-order endpoint). 0 = the customer is next.
     */
    stopsAway: number | null
    /** Customer drop-off pin (single-order endpoint only; null in list batch). */
    destination: TrackingDestination | null
    /** Delayed vehicle position (single-order endpoint only; null in list batch). */
    map: PublicMapDto | null
}

export type TrackingDestination = { lat: number; lng: number; label: string }

const SEALED_PACKAGE = new Set(['SEALED', 'READY_FOR_DISPATCH', 'DISPATCHED'])
const ACTIVE_PICK = new Set(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'])
const DELIVERED_SO = new Set(['DELIVERED', 'COMPLETED'])
const CONFIRMED_SO = new Set(['CONFIRMED', 'SHIPPED', 'DELIVERED', 'COMPLETED'])

function minDate(dates: Array<Date | null | undefined>): Date | null {
    const ts = dates.filter((d): d is Date => d instanceof Date).map((d) => d.getTime())
    return ts.length ? new Date(Math.min(...ts)) : null
}

function maxDate(dates: Array<Date | null | undefined>): Date | null {
    const ts = dates.filter((d): d is Date => d instanceof Date).map((d) => d.getTime())
    return ts.length ? new Date(Math.max(...ts)) : null
}

/** The shipment's current delivery attempt: newest non-cancelled trip DROPOFF link. */
function latestDropoff(shipment: TrackingShipmentFacts): TrackingStopLink | null {
    const links = shipment.links
        .filter((l) => l.action === 'DROPOFF' && l.tripStatus !== 'CANCELLED')
        .sort((a, b) => b.tripCreatedAt.getTime() - a.tripCreatedAt.getTime())
    return links[0] ?? null
}

export const COURIER_STATUS_LABEL: Record<string, string> = {
    BOOKED: 'Booked with courier',
    PICKED_UP: 'Picked up by courier',
    IN_TRANSIT: 'In transit',
    OUT_FOR_DELIVERY: 'Out for delivery',
    DELIVERED: 'Delivered',
    EXCEPTION: 'Delivery issue',
    RETURNED: 'Returning to seller',
}

const COURIER_HAS_PARCEL = new Set(['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'])

/** Active courier hand-off; a cancelled booking means the courier is no longer involved. */
function activeCourier(s: TrackingShipmentFacts): TrackingCourierFacts | null {
    return s.courier && s.courier.status !== 'CANCELLED' ? s.courier : null
}

/** EXCEPTION before pickup is a booking problem, not a failed delivery. */
function courierFailed(c: TrackingCourierFacts | null): boolean {
    if (!c) return false
    return c.status === 'RETURNED' || (c.status === 'EXCEPTION' && c.pickedUpAt != null)
}

function courierFailureNote(c: TrackingCourierFacts): string {
    return c.status === 'RETURNED'
        ? 'The parcel is being returned to the seller'
        : 'The courier reported a delivery issue'
}

function lastCourierEventAt(c: TrackingCourierFacts, status: string): Date | null {
    return maxDate(c.events.filter((e) => e.status === status).map((e) => e.occurredAt))
}

function shipmentDelivered(s: TrackingShipmentFacts): boolean {
    if (s.status === 'DELIVERED') return true
    if (activeCourier(s)?.status === 'DELIVERED') return true
    const link = latestDropoff(s)
    return link?.stopStatus === 'COMPLETED'
}

function toCourierDto(c: TrackingCourierFacts): CourierTrackingDto {
    return {
        carrierName: c.carrierName,
        trackingNumber: c.trackingNumber,
        trackingUrl: c.trackingUrl,
        status: c.status,
        statusLabel: COURIER_STATUS_LABEL[c.status] ?? c.status,
        events: [...c.events]
            .filter((e) => e.status !== 'CANCELLED')
            .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
            .map((e) => ({
                status: e.status,
                label: COURIER_STATUS_LABEL[e.status] ?? e.status,
                at: e.occurredAt.toISOString(),
            })),
    }
}

/** Named origin stop (warehouse / hub) of the started trip carrying a shipment. */
function departureHub(
    latest: Array<{ s: TrackingShipmentFacts; link: TrackingStopLink | null }>,
): string | null {
    for (const { s, link } of latest) {
        if (!link || (link.tripStatus !== 'IN_TRANSIT' && link.tripStatus !== 'COMPLETED')) {
            continue
        }
        const pickup = s.links.find(
            (l) => l.action === 'PICKUP' && l.tripId === link.tripId && l.stopName?.trim(),
        )
        if (pickup?.stopName) return pickup.stopName.trim()
    }
    return null
}

export function computeOrderTracking(facts: OrderTrackingFacts): OrderTrackingDto {
    const shipments = facts.packages
        .map((p) => p.shipment)
        .filter((s): s is TrackingShipmentFacts => s != null && s.status !== 'CANCELLED')
    const latest = shipments.map((s) => ({ s, link: latestDropoff(s) }))
    const couriers = shipments
        .map(activeCourier)
        .filter((c): c is TrackingCourierFacts => c != null)

    const allDelivered = shipments.length > 0 && shipments.every(shipmentDelivered)
    const failed = latest.filter(
        ({ s, link }) => !shipmentDelivered(s) && link?.stopStatus === 'FAILED',
    )
    const courierFailures = shipments
        .filter((s) => !shipmentDelivered(s))
        .map(activeCourier)
        .filter((c): c is TrackingCourierFacts => courierFailed(c))
    const inTransit = latest.filter(
        ({ s, link }) =>
            !shipmentDelivered(s) &&
            ((link?.tripStatus === 'IN_TRANSIT' && link.stopStatus !== 'FAILED') ||
                COURIER_HAS_PARCEL.has(activeCourier(s)?.status ?? '')),
    )
    const readyForDelivery =
        shipments.length > 0 ||
        facts.packages.some((p) => SEALED_PACKAGE.has(p.status)) ||
        // GI posted (legacy SHIPPED) = goods staged; still NOT in transit.
        facts.status === 'SHIPPED'
    const preparing =
        facts.packages.length > 0 ||
        facts.pickingTasks.some((t) => ACTIVE_PICK.has(t.status) || t.pickedQty > 0)

    let status: CustomerOrderStatus
    if (facts.status === 'CANCELLED') status = 'CANCELLED'
    else if (allDelivered || DELIVERED_SO.has(facts.status)) status = 'DELIVERED'
    else if (failed.length > 0 || courierFailures.length > 0) status = 'DELIVERY_FAILED'
    else if (inTransit.length > 0) status = 'IN_TRANSIT'
    else if (readyForDelivery) status = 'READY_FOR_DELIVERY'
    else if (preparing) status = 'PREPARING'
    else if (CONFIRMED_SO.has(facts.status)) status = 'CONFIRMED'
    else status = 'PLACED'

    const startedTrips = latest
        .map(({ link }) => link)
        .filter(
            (l): l is TrackingStopLink =>
                l != null && (l.tripStatus === 'IN_TRANSIT' || l.tripStatus === 'COMPLETED'),
        )

    const at: Record<CustomerOrderStatus, Date | null> = {
        PLACED: facts.createdAt,
        CONFIRMED:
            facts.approvedAt ??
            facts.paidAt ??
            minDate(facts.pickingTasks.map((t) => t.createdAt)),
        PREPARING: minDate([
            ...facts.packages.map((p) => p.createdAt),
            ...facts.pickingTasks.map((t) =>
                t.completedAt ?? (t.status !== 'OPEN' ? t.updatedAt : null),
            ),
        ]),
        READY_FOR_DELIVERY:
            minDate(shipments.map((s) => s.createdAt)) ??
            minDate(facts.packages.filter((p) => SEALED_PACKAGE.has(p.status)).map((p) => p.updatedAt)),
        IN_TRANSIT: minDate([
            ...startedTrips.map((l) => l.tripStartedAt),
            ...couriers.map((c) => c.pickedUpAt),
        ]),
        DELIVERED: maxDate(
            shipments.flatMap((s) => [
                s.deliveredAt,
                latestDropoff(s)?.stopCompletedAt,
                activeCourier(s)?.deliveredAt,
            ]),
        ),
        DELIVERY_FAILED: maxDate([
            ...failed.map(({ link }) => link?.stopFailedAt),
            ...courierFailures.map((c) => lastCourierEventAt(c, c.status)),
        ]),
        CANCELLED: facts.status === 'CANCELLED' ? facts.updatedAt : null,
    }

    const flow: CustomerOrderStatus[] = [
        'PLACED',
        'CONFIRMED',
        'PREPARING',
        'READY_FOR_DELIVERY',
        'IN_TRANSIT',
        status === 'DELIVERY_FAILED' ? 'DELIVERY_FAILED' : 'DELIVERED',
    ]

    let checkpoints: TrackingCheckpoint[]
    if (status === 'CANCELLED') {
        // Show the steps actually reached before cancellation, then Cancelled.
        const reached = flow.filter((code) => code !== 'DELIVERED' && at[code] != null)
        checkpoints = [...reached, 'CANCELLED' as const].map((code) => ({
            code,
            label: CUSTOMER_STATUS_LABEL[code],
            at: at[code]?.toISOString() ?? null,
            done: true,
            current: code === 'CANCELLED',
        }))
    } else {
        const currentIndex = flow.indexOf(status)
        checkpoints = flow.map((code, index) => ({
            code,
            label: CUSTOMER_STATUS_LABEL[code],
            // Passed steps stay done even if their event time was not recorded.
            at: index <= currentIndex ? (at[code]?.toISOString() ?? null) : null,
            done: index <= currentIndex,
            current: index === currentIndex,
        }))
        if (status === 'DELIVERY_FAILED') {
            checkpoints[checkpoints.length - 1].note =
                failed.length > 0
                    ? publicFailureReason(failed[0]?.link?.failureCode)
                    : courierFailureNote(courierFailures[0])
        }
        const hub = departureHub(latest)
        const inTransitStep = checkpoints.find((c) => c.code === 'IN_TRANSIT')
        if (hub && inTransitStep?.done) inTransitStep.note = `Departed ${hub}`
        else if (couriers[0] && inTransitStep?.done) {
            inTransitStep.note =
                couriers[0].status === 'OUT_FOR_DELIVERY'
                    ? `Out for delivery with ${couriers[0].carrierName}`
                    : `With ${couriers[0].carrierName}`
        }
    }

    return {
        orderId: facts.orderId,
        orderNumber: facts.orderNumber,
        customerStatus: status,
        customerStatusLabel: CUSTOMER_STATUS_LABEL[status],
        checkpoints,
        courier: couriers[0] ? toCourierDto(couriers[0]) : null,
        stopsAway: null,
        destination: null,
        map: null,
    }
}

/** Stops the vehicle will not visit again (skipped stops are not driven to). */
const SETTLED_STOP = new Set(['COMPLETED', 'FAILED', 'SKIPPED'])

/** Stops the vehicle still has to make before the customer's stop. */
export function stopsBefore(
    stops: Array<{ sequence: number; status: string }>,
    customerSequence: number,
): number {
    return stops.filter(
        (s) => s.sequence < customerSequence && !SETTLED_STOP.has(s.status),
    ).length
}

/** Out for delivery: every stop sequenced before the customer's stop is settled. */
export function isLastMile(
    stops: Array<{ sequence: number; status: string }>,
    customerSequence: number,
): boolean {
    return stopsBefore(stops, customerSequence) === 0
}
