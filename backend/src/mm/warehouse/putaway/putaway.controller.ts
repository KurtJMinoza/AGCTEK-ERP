import { Controller, Get, Post, Param, Query, Body, BadRequestException } from '@nestjs/common'
import { PutawayService } from './putaway.service'
import { CreatePutawayDto } from './dto/create-putaway.dto'
import { PutawayQueryDto } from './dto/putaway-query.dto'
import { ConfirmPutawayDto } from './dto/confirm-putaway.dto'
import { AssignPutawayDto } from './dto/assign-putaway.dto'

@Controller('mm/putaway')
export class PutawayController {
    constructor(private readonly service: PutawayService) {}

    @Get()
    findAll(@Query() query: PutawayQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() dto: CreatePutawayDto) {
        return this.service.create(dto)
    }

    @Post(':id/assign')
    assign(@Param('id') id: string, @Body() dto: AssignPutawayDto) {
        const worker = dto.workerId || dto.assignedWorker
        if (!worker) throw new BadRequestException('workerId is required')
        return this.service.assign(id, worker)
    }

    @Post(':id/confirm')
    confirm(@Param('id') id: string, @Body() dto: ConfirmPutawayDto) {
        return this.service.confirm(id, dto)
    }

    @Post(':id/cancel')
    cancel(@Param('id') id: string) {
        return this.service.cancel(id)
    }
}
