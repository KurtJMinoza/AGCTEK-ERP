import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { DriversService } from './drivers.service'
import type { ListQuery } from '../scm.utils'

@Controller('scm/drivers')
export class DriversController {
    constructor(private readonly driversService: DriversService) {}

    @Get()
    findAll(@Query() query: ListQuery) {
        return this.driversService.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.driversService.findOne(id)
    }

    @Post()
    create(@Body() body: Record<string, unknown>) {
        return this.driversService.create(body as never)
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.driversService.update(id, body as never)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.driversService.remove(id)
    }
}
