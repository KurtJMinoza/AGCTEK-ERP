import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common'
import { PickWaveService } from './pick-wave.service'
import { CreatePickWaveDto } from './dto/create-pick-wave.dto'
import { PickWaveQueryDto } from './dto/pick-wave-query.dto'

@Controller('mm/pick-waves')
export class PickWaveController {
    constructor(private readonly service: PickWaveService) {}

    @Get()
    findAll(@Query() query: PickWaveQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() dto: CreatePickWaveDto) {
        return this.service.create(dto)
    }

    @Post(':id/optimize')
    optimize(@Param('id') id: string) {
        return this.service.optimizeSequence(id)
    }

    @Post(':id/start')
    start(@Param('id') id: string) {
        return this.service.start(id)
    }

    @Post(':id/complete')
    complete(@Param('id') id: string) {
        return this.service.complete(id)
    }

    @Post(':id/cancel')
    cancel(@Param('id') id: string) {
        return this.service.cancel(id)
    }
}
