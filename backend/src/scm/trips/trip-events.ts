/**
 * In-process SCM trip execution events (EventEmitter2), emitted after the
 * owning transaction commits. Consumers must be idempotent and best-effort.
 */
export const TRIP_EVENTS = {
    /** Driver Start Route committed (trip → IN_TRANSIT). */
    STARTED: 'trip.started',
    /** A stop was settled as delivered (POD). */
    STOP_COMPLETED: 'trip.stop.completed',
    /** A stop delivery attempt failed (reason code recorded). */
    STOP_FAILED: 'trip.stop.failed',
} as const

export type TripStartedEvent = { tripId: string }

export type TripStopSettledEvent = {
    tripId: string
    stopId: string
    /** DROPOFF shipment ids at the stop */
    shipmentIds: string[]
    failureCode?: string | null
}
