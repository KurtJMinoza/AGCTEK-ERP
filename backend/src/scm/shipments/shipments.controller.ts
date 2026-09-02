import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ShipmentsService } from './shipments.service'
import type { ListQuery } from '../scm.utils'

@Controller('scm/shipments')
export class ShipmentsController {
    constructor(private readonly shipmentsService: ShipmentsService) {}

    @Get()
    findAll(@Query() query: ListQuery) {
        return this.shipmentsService.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.shipmentsService.findOne(id)
    }

    @Post()
    create(@Body() body: Record<string, unknown>) {
        return this.shipmentsService.create(body as never)
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.shipmentsService.update(id, body as never)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.shipmentsService.remove(id)
    }
}
