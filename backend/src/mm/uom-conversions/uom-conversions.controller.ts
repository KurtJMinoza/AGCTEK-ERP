import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common'
import { UomConversionsService } from './uom-conversions.service'

@Controller('mm/uom-conversions')
export class UomConversionsController {
    constructor(private readonly service: UomConversionsService) {}

    @Get()
    findAll(@Query('materialId') materialId?: string) {
        return this.service.findAll(materialId)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() body: { fromUomId: string; toUomId: string; factor: number; materialId?: string }) {
        return this.service.create(body)
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() body: any) {
        return this.service.update(id, body)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
