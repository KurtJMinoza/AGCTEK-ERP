import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common'
import { TripStatus } from '@prisma/client'
import { TripsService } from './trips.service'
import type { ListQuery } from '../scm.utils'

@Controller('scm/trips')
export class TripsController {
    constructor(private readonly tripsService: TripsService) {}

    @Get()
    findAll(@Query() query: ListQuery) {
        return this.tripsService.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.tripsService.findOne(id)
    }

    @Post()
    create(@Body() body: Record<string, unknown>) {
        return this.tripsService.create(body as never)
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.tripsService.update(id, body as never)
    }

    @Patch(':id/status')
    updateStatus(
        @Param('id') id: string,
        @Body() body: { status?: TripStatus },
    ) {
        return this.tripsService.updateStatus(id, body.status as TripStatus)
    }

    @Post(':id/stops')
    addStop(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.tripsService.addStop(id, body as never)
    }

    @Patch(':id/stops/:stopId')
    updateStop(
        @Param('id') id: string,
        @Param('stopId') stopId: string,
        @Body() body: Record<string, unknown>,
    ) {
        return this.tripsService.updateStop(id, stopId, body as never)
    }

    @Delete(':id/stops/:stopId')
    removeStop(@Param('id') id: string, @Param('stopId') stopId: string) {
        return this.tripsService.removeStop(id, stopId)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.tripsService.remove(id)
    }
}
