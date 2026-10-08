import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common'
import { ReservationService } from './reservation.service'
import { InventoryAvailabilityService } from './inventory-availability.service'
import {
    CreateReservationDto,
    ReservationQueryDto,
    AtpQueryDto,
} from './dto/reservation.dto'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('inventory-management', 'reservations')

@Controller('mm')
export class ReservationController {
    constructor(
        private reservations: ReservationService,
        private availability: InventoryAvailabilityService,
    ) {}

    @Get('reservations')
    @MmRead(READERS)
    findAll(@Query() query: ReservationQueryDto) {
        return this.reservations.findAll(query)
    }

    @Get('reservations/:id')
    @MmRead(READERS)
    findOne(@Param('id') id: string) {
        return this.reservations.findOne(id)
    }

    @MmMutation(mmFeatures('inventory-management', 'reservations'))
    @Post('reservations')
    create(@Body() dto: CreateReservationDto) {
        return this.reservations.create(dto)
    }

    @MmMutation(mmFeatures('inventory-management', 'reservations'))
    @Post('reservations/:id/cancel')
    cancel(@Param('id') id: string) {
        return this.reservations.cancel(id)
    }

    @MmMutation(mmFeatures('inventory-management', 'reservations'))
    @Post('reservations/expire-due')
    expireDue() {
        return this.reservations.expireDue()
    }

    @Get('available-stock')
    @MmRead(READERS)
    atp(@Query() query: AtpQueryDto) {
        return this.availability.getAtp(query)
    }
}
