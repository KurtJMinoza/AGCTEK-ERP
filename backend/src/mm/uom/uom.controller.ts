import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common'
import { UomService } from './uom.service'

@Controller('mm/uom')
export class UomController {
    constructor(private readonly service: UomService) {}

    @Get()
    findAll() {
        return this.service.findAll()
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() body: { code?: string; name: string; symbol?: string; sortOrder?: number }) {
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
