import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { VehiclesService } from './vehicles.service'
import type { ListQuery } from '../scm.utils'

@Controller('scm/vehicles')
export class VehiclesController {
    constructor(private readonly vehiclesService: VehiclesService) {}

    @Get()
    findAll(@Query() query: ListQuery) {
        return this.vehiclesService.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.vehiclesService.findOne(id)
    }

    @Post()
    create(@Body() body: Record<string, unknown>) {
        return this.vehiclesService.create(body as never)
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.vehiclesService.update(id, body as never)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.vehiclesService.remove(id)
    }
}
