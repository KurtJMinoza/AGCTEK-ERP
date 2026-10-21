/** In-process events emitted by SCM Couriers (EventEmitter2). */
export const COURIER_EVENTS = {
    /** Booked or cancelled — consumers re-project carrier + tracking number. */
    CONSIGNMENT_CHANGED: 'courier.consignment.changed',
    /** Any status move; consumers notify shoppers. */
    STATUS_CHANGED: 'courier.consignment.status-changed',
} as const

/** Null carrier / tracking = booking cancelled. */
export type CourierConsignmentChangedEvent = {
    shipmentId: string
    carrierName: string | null
    trackingNumber: string | null
}

export type CourierStatusChangedEvent = {
    consignmentId: string
    shipmentId: string
    status: string
    /** Courier has (or had) the parcel — an EXCEPTION before pickup is not a failed delivery. */
    pickedUp: boolean
}
