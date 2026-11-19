import { ConflictException } from '@nestjs/common'
import { StopStatus, TripStopType } from '@prisma/client'

/**
 * Ocular trips reuse `TripStop.stopType`: SHIP = pickup point, TO = dropoff point (the
 * visits). Pickups are done before the trip leaves; dropoffs are worked after it starts.
 */
type StopLike = { stopType?: TripStopType | null; status: StopStatus; name?: string | null; sequence?: number }

export const isPickupStop = (stop: Pick<StopLike, 'stopType'>) => stop.stopType === TripStopType.SHIP

/** Pickup points that are not marked done yet. */
export const openPickups = <T extends StopLike>(stops: T[]) =>
    stops.filter((stop) => isPickupStop(stop) && stop.status !== StopStatus.COMPLETED)

/** Stop order is valid only when every pickup comes before every dropoff. */
export function pickupsPrecedeDropoffs(stops: Array<Pick<StopLike, 'stopType'>>) {
    let seenDropoff = false
    for (const stop of stops) {
        if (isPickupStop(stop)) {
            if (seenDropoff) return false
        } else {
            seenDropoff = true
        }
    }
    return true
}

/** Start gate: the trip cannot leave while any pickup point is still open. */
export function assertPickupsDone(stops: StopLike[]) {
    const open = openPickups(stops)
    if (open.length === 0) return
    const labels = open.map((stop) => (stop.sequence != null ? `#${stop.sequence}` : (stop.name ?? 'pickup')))
    throw new ConflictException(
        `Mark every pickup point done before starting the trip (open: ${labels.join(', ')})`,
    )
}
