import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common'
import { UomConversionsService } from './uom-conversions.service'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/uom-conversions')
export class UomConversionsController {
    constructor(private readonly service: UomConversionsService) {}

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
    @MmMutation(mmFeatures('material-master', 'uom-conversions'), 'create')
    create(@Body() body: { fromUomId: string; toUomId: string; factor: number; materialId?: string }) {
        return this.service.create(body)
    }

    @Put(':id')
    @MmMutation(mmFeatures('material-master', 'uom-conversions'), 'update')
    update(@Param('id') id: string, @Body() body: any) {
        return this.service.update(id, body)
    }

    @Delete(':id')
    @MmMutation(mmFeatures('material-master', 'uom-conversions'), 'delete')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
