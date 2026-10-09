import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common'
import { BarcodesService } from './barcodes.service'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/barcodes')
export class BarcodesController {
    constructor(private readonly service: BarcodesService) {}

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
    @MmMutation(mmFeatures('material-master', 'barcodes'), 'create')
    create(@Body() body: { materialId: string; barcodeType: string; barcodeValue: string; isPrimary?: boolean }) {
        return this.service.create(body)
    }

    @Delete(':id')
    @MmMutation(mmFeatures('material-master', 'barcodes'), 'delete')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
