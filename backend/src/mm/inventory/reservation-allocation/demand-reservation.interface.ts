import { CreateReservationHeaderDto } from './dto/reservation-allocation.dto'

/**
 * Integration surface for SD / Production / other domains.
 * MM owns reservation logic; external modules supply demand references only.
 */
export interface DemandReservationRequest extends CreateReservationHeaderDto {
    /** Calling module identifier e.g. SD, PP */
    sourceModule: string
}

export interface DemandReservationPort {
    createFromDemand(request: DemandReservationRequest): Promise<{ reservationHeaderId: string }>
}

export const DEMAND_RESERVATION_PORT = Symbol('DEMAND_RESERVATION_PORT')
