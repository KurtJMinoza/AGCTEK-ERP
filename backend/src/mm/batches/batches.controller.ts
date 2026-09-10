import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common'
import { BatchesService } from './batches.service'

@Controller('mm/batches')
export class BatchesController {
    constructor(private readonly service: BatchesService) {}

    @Get()
    findAll(@Query('materialId') materialId?: string) {
        return this.service.findAll(materialId)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() body: {
        materialId: string
        batchNumber: string
        manufacturingDate?: string
        expiryDate?: string
        supplierId?: string
        status?: string
    }) {
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
