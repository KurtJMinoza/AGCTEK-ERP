import { BadRequestException } from '@nestjs/common'
import { CourierConsignmentStatus, ShipmentStatus } from '@prisma/client'

const S = CourierConsignmentStatus

/** Allowed manual / adapter moves. DELIVERED, RETURNED and CANCELLED are final. */
const TRANSITIONS: Record<CourierConsignmentStatus, CourierConsignmentStatus[]> = {
    BOOKED: [S.PICKED_UP, S.EXCEPTION, S.CANCELLED],
    PICKED_UP: [S.IN_TRANSIT, S.OUT_FOR_DELIVERY, S.DELIVERED, S.EXCEPTION, S.RETURNED],
    IN_TRANSIT: [S.OUT_FOR_DELIVERY, S.DELIVERED, S.EXCEPTION, S.RETURNED],
    OUT_FOR_DELIVERY: [S.IN_TRANSIT, S.DELIVERED, S.EXCEPTION, S.RETURNED],
    EXCEPTION: [
        S.PICKED_UP,
        S.IN_TRANSIT,
        S.OUT_FOR_DELIVERY,
        S.DELIVERED,
        S.RETURNED,
        S.CANCELLED,
    ],
    DELIVERED: [],
    RETURNED: [],
    CANCELLED: [],
}

/** Statuses that need the parcel in the courier's hands (goods issue already posted). */
const NEEDS_PICKUP = new Set<CourierConsignmentStatus>([
    S.IN_TRANSIT,
    S.OUT_FOR_DELIVERY,
    S.DELIVERED,
    S.RETURNED,
])

/**
 * `pickedUp` = goods already handed over. An EXCEPTION before pickup can only go to
 * PICKED_UP or CANCELLED; after pickup it can never be cancelled or picked up again.
 */
export function assertCourierTransition(
    from: CourierConsignmentStatus,
    to: CourierConsignmentStatus,
    pickedUp: boolean,
) {
    if (!TRANSITIONS[from].includes(to)) {
        throw new BadRequestException(
            `A ${from} consignment cannot move to ${to}`,
        )
    }
    if (from === S.EXCEPTION) {
        if (!pickedUp && NEEDS_PICKUP.has(to)) {
            throw new BadRequestException(
                `The parcel was never picked up — mark it PICKED_UP before ${to}`,
            )
        }
        if (pickedUp && (to === S.CANCELLED || to === S.PICKED_UP)) {
            throw new BadRequestException(
                to === S.CANCELLED
                    ? 'The courier already has the parcel — it cannot be cancelled (use RETURNED)'
                    : 'The parcel was already picked up',
            )
        }
    }
}

export function nextCourierStatuses(
    from: CourierConsignmentStatus,
    pickedUp: boolean,
): CourierConsignmentStatus[] {
    return TRANSITIONS[from].filter((to) => {
        try {
            assertCourierTransition(from, to, pickedUp)
            return true
        } catch {
            return false
        }
    })
}

/** Shipment status that mirrors a courier status (docs/SCM_COURIERS.md). */
export function shipmentStatusForCourier(
    status: CourierConsignmentStatus,
): ShipmentStatus {
    switch (status) {
        case S.BOOKED:
        case S.CANCELLED:
            return ShipmentStatus.READY
        case S.PICKED_UP:
            return ShipmentStatus.DISPATCHED
        case S.IN_TRANSIT:
        case S.OUT_FOR_DELIVERY:
            return ShipmentStatus.IN_TRANSIT
        case S.DELIVERED:
            return ShipmentStatus.DELIVERED
        case S.EXCEPTION:
            return ShipmentStatus.EXCEPTION_HOLD
        case S.RETURNED:
            return ShipmentStatus.RETURNED
    }
}

/** Carrier codes are short upper-case keys (JNT, LBC, NINJAVAN). */
const CARRIER_CODE = /^[A-Z0-9_-]{2,20}$/

export function normalizeCarrierCode(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new BadRequestException('code is required')
    }
    const code = value.trim().toUpperCase()
    if (!CARRIER_CODE.test(code)) {
        throw new BadRequestException(
            'code must be 2–20 characters: letters, digits, dash or underscore',
        )
    }
    return code
}

/** `{tracking}` is replaced with the URL-encoded tracking number. */
export function validateTrackingUrlTemplate(value: unknown): string | null {
    if (value == null || value === '') return null
    if (typeof value !== 'string') {
        throw new BadRequestException('trackingUrlTemplate must be a string')
    }
    const template = value.trim()
    if (!/^https?:\/\//i.test(template) || !template.includes('{tracking}')) {
        throw new BadRequestException(
            'trackingUrlTemplate must be an http(s) URL containing {tracking}',
        )
    }
    return template
}

export function trackingUrl(
    template: string | null | undefined,
    trackingNumber: string | null | undefined,
): string | null {
    if (!template || !trackingNumber) return null
    return template.replace('{tracking}', encodeURIComponent(trackingNumber))
}

/** AWB as typed by the dispatcher: trimmed, inner whitespace removed. */
export function normalizeTrackingNumber(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new BadRequestException('trackingNumber is required')
    }
    const tracking = value.replace(/\s+/g, '')
    if (tracking.length > 64) {
        throw new BadRequestException('trackingNumber is too long')
    }
    return tracking
}
