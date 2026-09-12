import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ReservationEngineService } from './reservation-engine.service'
import { AllocationEngineService } from './allocation-engine.service'
import { InventoryAvailabilityService } from '../inventory-availability.service'
import {
    AllocateReservationDto,
    AllocationQueryDto,
    CreateAllocationDto,
    CreateReservationHeaderDto,
    ReservationQueryDto,
} from './dto/reservation-allocation.dto'
import { AvailabilityQueryDto } from '../dto/availability-query.dto'
import { MmMutation } from '../../common/mm-mutation.decorator'

@Controller('mm/inventory')
export class ReservationAllocationController {
    constructor(
        private reservations: ReservationEngineService,
        private allocations: AllocationEngineService,
        private availability: InventoryAvailabilityService,
    ) {}

    @Get('availability')
    getAvailability(@Query() query: AvailabilityQueryDto) {
        return this.availability.getAvailability(query)
    }

    @Get('reservations')
    listReservations(@Query() query: ReservationQueryDto) {
        return this.reservations.findAll(query)
    }

    @Get('reservations/:id')
    getReservation(@Param('id') id: string) {
        return this.reservations.findOne(id)
    }

    @MmMutation()
    @Post('reservations')
    createReservation(@Body() dto: CreateReservationHeaderDto) {
        return this.reservations.create(dto)
    }

    @MmMutation()
    @Post('reservations/:id/release')
    releaseReservation(@Param('id') id: string) {
        return this.reservations.release(id)
    }

    @MmMutation()
    @Post('reservations/:id/cancel')
    cancelReservation(@Param('id') id: string) {
        return this.reservations.cancel(id)
    }

    @MmMutation()
    @Post('reservations/:id/allocate')
    allocateReservation(@Param('id') id: string, @Body() dto: AllocateReservationDto) {
        return this.reservations.allocate(id, dto)
    }

    @Get('allocations')
    listAllocations(@Query() query: AllocationQueryDto) {
        return this.allocations.findAll(query)
    }

    @Get('allocations/:id')
    getAllocation(@Param('id') id: string) {
        return this.allocations.findOne(id)
    }

    @MmMutation()
    @Post('allocations')
    createAllocation(@Body() dto: CreateAllocationDto) {
        return this.allocations.create(dto)
    }

    @MmMutation()
    @Post('allocations/:id/release')
    releaseAllocation(@Param('id') id: string) {
        return this.allocations.release(id)
    }
}
