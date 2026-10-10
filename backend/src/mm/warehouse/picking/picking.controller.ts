import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common'
import { PickingService } from './picking.service'
import { CreatePickingDto } from './dto/create-picking.dto'
import { PickingQueryDto } from './dto/picking-query.dto'
import { ConfirmPickingDto } from './dto/confirm-picking.dto'
import { AssignPickingDto } from './dto/assign-picking.dto'
import { IsOptional, IsString } from 'class-validator'
import { MmMutation, MmRead } from '../../common/mm-mutation.decorator'
import { mmFeatures } from '../../../permissions/permissions.constants'

class FromReservationDto {
    @IsOptional()
    @IsString()
    strategy?: string

    @IsOptional()
    @IsString()
    zoneCode?: string
}

/** Read access: the pages that load these endpoints. */
const READERS = [...mmFeatures('barcode-rfid', 'mobile-picking'), ...mmFeatures('warehouse-management', 'overview', 'picking')]

@Controller('mm/picking')
export class PickingController {
    constructor(private readonly service: PickingService) {}

    @Get()
    @MmRead(READERS)
    findAll(@Query() query: PickingQueryDto) {
        return this.service.findAll(query)
    }

    /** Active workers selectable for picking assignment (company-scoped). */
    @Get('assignable-users')
    @MmRead(READERS)
    assignableUsers(
        @Query('companyId') companyId?: string,
        @Query('warehouseId') warehouseId?: string,
    ) {
        return this.service.assignableUsers(companyId, warehouseId)
    }

    @Get(':id')
    @MmRead(READERS)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    @MmMutation(mmFeatures('warehouse-management', 'picking'), 'create')
    create(@Body() dto: CreatePickingDto) {
        return this.service.create(dto)
    }

    @Post('from-reservation/:reservationId')
    @MmMutation(mmFeatures('warehouse-management', 'picking'), 'create')
    fromReservation(
        @Param('reservationId') reservationId: string,
        @Body() dto: FromReservationDto,
    ) {
        return this.service.createFromReservation(
            reservationId,
            dto.strategy ?? 'FIFO',
            dto.zoneCode,
        )
    }

    @Post(':id/assign')
    @MmMutation([...mmFeatures('warehouse-management', 'picking'), ...mmFeatures('barcode-rfid', 'mobile-picking')], 'update')
    assign(@Param('id') id: string, @Body() dto: AssignPickingDto) {
        return this.service.assign(id, dto.userId)
    }

    @Post(':id/confirm')
    @MmMutation([...mmFeatures('warehouse-management', 'picking'), ...mmFeatures('barcode-rfid', 'mobile-picking')], 'update')
    confirm(@Param('id') id: string, @Body() dto: ConfirmPickingDto) {
        return this.service.confirmPick(id, dto)
    }

    @Post(':id/cancel')
    @MmMutation(mmFeatures('warehouse-management', 'picking'), 'update')
    cancel(@Param('id') id: string) {
        return this.service.cancel(id)
    }
}
