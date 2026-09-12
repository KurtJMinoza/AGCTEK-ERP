import { Injectable } from '@nestjs/common'
import { ReservationService } from '../outbound/reservation.service'
import { CreateReservationDto, ReservationQueryDto } from '../outbound/dto/reservation.dto'

/**
 * MM-08 reservation facade — delegates to ReservationService.
 * Reservations adjust reservedQuantity only; they never post physical inventory.
 */
@Injectable()
export class InventoryReservationService {
    constructor(private reservations: ReservationService) {}

    findAll(query: ReservationQueryDto) {
        return this.reservations.findAll(query)
    }

    findOne(id: string) {
        return this.reservations.findOne(id)
    }

    create(dto: CreateReservationDto) {
        return this.reservations.create(dto)
    }

    cancel(id: string) {
        return this.reservations.cancel(id)
    }

    expireDue() {
        return this.reservations.expireDue()
    }
}
