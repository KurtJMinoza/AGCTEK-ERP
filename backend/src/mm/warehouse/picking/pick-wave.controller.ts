import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common'
import { PickWaveService } from './pick-wave.service'
import { CreatePickWaveDto } from './dto/create-pick-wave.dto'
import { PickWaveQueryDto } from './dto/pick-wave-query.dto'
import { MmMutation, MmRead } from '../../common/mm-mutation.decorator'
import { mmFeatures } from '../../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('warehouse-management', 'picking')

@Controller('mm/pick-waves')
export class PickWaveController {
    constructor(private readonly service: PickWaveService) {}

    @Get()
    @MmRead(READERS)
    findAll(@Query() query: PickWaveQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    @MmRead(READERS)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    @MmMutation(mmFeatures('warehouse-management', 'picking'), 'create')
    create(@Body() dto: CreatePickWaveDto) {
        return this.service.create(dto)
    }

    @Post(':id/optimize')
    @MmMutation(mmFeatures('warehouse-management', 'picking'), 'update')
    optimize(@Param('id') id: string) {
        return this.service.optimizeSequence(id)
    }

    @Post(':id/start')
    @MmMutation(mmFeatures('warehouse-management', 'picking'), 'update')
    start(@Param('id') id: string) {
        return this.service.start(id)
    }

    @Post(':id/complete')
    @MmMutation(mmFeatures('warehouse-management', 'picking'), 'update')
    complete(@Param('id') id: string) {
        return this.service.complete(id)
    }

    @Post(':id/cancel')
    @MmMutation(mmFeatures('warehouse-management', 'picking'), 'update')
    cancel(@Param('id') id: string) {
        return this.service.cancel(id)
    }
}
