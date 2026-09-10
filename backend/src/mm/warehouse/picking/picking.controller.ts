import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common'
import { PickingService } from './picking.service'
import { CreatePickingDto } from './dto/create-picking.dto'
import { PickingQueryDto } from './dto/picking-query.dto'
import { ConfirmPickingDto } from './dto/confirm-picking.dto'
import { AssignPickingDto } from './dto/assign-picking.dto'
import { IsOptional, IsString } from 'class-validator'

class FromReservationDto {
    @IsOptional()
    @IsString()
    strategy?: string

    @IsOptional()
    @IsString()
    zoneCode?: string
}

@Controller('mm/picking')
export class PickingController {
    constructor(private readonly service: PickingService) {}

    @Get()
    findAll(@Query() query: PickingQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() dto: CreatePickingDto) {
        return this.service.create(dto)
    }

    @Post('from-reservation/:reservationId')
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
    assign(@Param('id') id: string, @Body() dto: AssignPickingDto) {
        return this.service.assign(id, dto.userId)
    }

    @Post(':id/confirm')
    confirm(@Param('id') id: string, @Body() dto: ConfirmPickingDto) {
        return this.service.confirmPick(id, dto)
    }

    @Post(':id/cancel')
    cancel(@Param('id') id: string) {
        return this.service.cancel(id)
    }
}
