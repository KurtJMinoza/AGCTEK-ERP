import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common'
import { ReservationService } from './reservation.service'
import { InventoryAvailabilityService } from './inventory-availability.service'
import {
    CreateReservationDto,
    ReservationQueryDto,
    AtpQueryDto,
} from './dto/reservation.dto'

@Controller('mm')
export class ReservationController {
    constructor(
        private reservations: ReservationService,
        private availability: InventoryAvailabilityService,
    ) {}

    @Get('reservations')
    findAll(@Query() query: ReservationQueryDto) {
        return this.reservations.findAll(query)
    }

    @Get('reservations/:id')
    findOne(@Param('id') id: string) {
        return this.reservations.findOne(id)
    }

    @Post('reservations')
    create(@Body() dto: CreateReservationDto) {
        return this.reservations.create(dto)
    }

    @Post('reservations/:id/cancel')
    cancel(@Param('id') id: string) {
        return this.reservations.cancel(id)
    }

    @Post('reservations/expire-due')
    expireDue() {
        return this.reservations.expireDue()
    }

    @Get('available-stock')
    atp(@Query() query: AtpQueryDto) {
        return this.availability.getAtp(query)
    }
}
