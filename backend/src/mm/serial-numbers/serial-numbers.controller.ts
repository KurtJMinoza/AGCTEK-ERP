import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common'
import { SerialNumbersService } from './serial-numbers.service'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/serial-numbers')
export class SerialNumbersController {
    constructor(private readonly service: SerialNumbersService) {}

    @Get()
    @MmRead(MM_REFERENCE_READ)
    findAll(@Query('materialId') materialId?: string) {
        return this.service.findAll(materialId)
    }

    @Get(':id')
    @MmRead(MM_REFERENCE_READ)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    @MmMutation(mmFeatures('material-master', 'serial-numbers'), 'create')
    create(@Body() body: {
        materialId: string
        batchId?: string
        currentWarehouseId?: string
        currentBinId?: string
        status?: string
    }) {
        return this.service.create(body)
    }

    @Put(':id')
    @MmMutation(mmFeatures('material-master', 'serial-numbers'), 'update')
    update(@Param('id') id: string, @Body() body: any) {
        return this.service.update(id, body)
    }

    @Delete(':id')
    @MmMutation(mmFeatures('material-master', 'serial-numbers'), 'delete')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
