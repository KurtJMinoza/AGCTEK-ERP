import type { DeliveryFailureReason, TripStopType } from '../types'

/** What the driver does at a stop. Legacy stops (no type) are deliveries. */
export type StopKind = 'LOAD' | 'DELIVER' | 'RETURN'

export function stopKind(stopType: TripStopType | null | undefined): StopKind {
    if (stopType === 'SHIP') return 'LOAD'
    if (stopType === 'RETURN') return 'RETURN'
    return 'DELIVER'
}

export const STOP_KIND_LABEL: Record<StopKind, string> = {
    LOAD: 'Load',
    DELIVER: 'Deliver',
    RETURN: 'Return',
}

/** Manifest line verb per shipment link action. */
export const LINK_ACTION_LABEL: Record<string, string> = {
    PICKUP: 'Load',
    DROPOFF: 'Deliver',
    RETURN: 'Return',
}

/** Mirrors backend LOAD_FAILURE_REASONS — no customer at the warehouse. */
export const LOAD_FAILURE_CODES: readonly DeliveryFailureReason[] = ['VEHICLE_ISSUE', 'OTHER']
