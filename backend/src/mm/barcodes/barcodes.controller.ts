import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common'
import { BarcodesService } from './barcodes.service'

@Controller('mm/barcodes')
export class BarcodesController {
    constructor(private readonly service: BarcodesService) {}

    @Get()
    findAll(@Query('materialId') materialId?: string) {
        return this.service.findAll(materialId)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() body: { materialId: string; barcodeType: string; barcodeValue: string; isPrimary?: boolean }) {
        return this.service.create(body)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
