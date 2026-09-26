import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common'
import { ForecastsService } from './forecasts.service'
import type { ListQuery } from '../scm.utils'

@Controller('scm/forecasts')
export class ForecastsController {
    constructor(private readonly forecastsService: ForecastsService) {}

    @Get()
    findAll(@Query() query: ListQuery) {
        return this.forecastsService.findAll(query)
    }

    @Post()
    create(@Body() body: Record<string, unknown>) {
        return this.forecastsService.create(body as never)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.forecastsService.remove(id)
    }
}
