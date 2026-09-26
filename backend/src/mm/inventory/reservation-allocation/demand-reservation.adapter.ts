import { Injectable } from '@nestjs/common'
import {
    DemandReservationPort,
    DemandReservationRequest,
} from './demand-reservation.interface'
import { ReservationEngineService } from './reservation-engine.service'

@Injectable()
export class DemandReservationAdapter implements DemandReservationPort {
    constructor(private reservations: ReservationEngineService) {}

    async createFromDemand(request: DemandReservationRequest) {
        const header = await this.reservations.create(request)
        return { reservationHeaderId: header.id }
    }
}
