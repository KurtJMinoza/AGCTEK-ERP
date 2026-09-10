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
    findAll(
        @Query() query: ListQuery & { vehicleId?: string; driverId?: string },
    ) {
        return this.tripsService.findAll(query)
    }

    /** Driver mobile — active ASSIGNED / IN_TRANSIT trip. */
    @Get('active')
    findActive(@Query('driverId') driverId: string) {
        return this.tripsService.findActiveForDriver(driverId)
    }

    @Post('assign-load')
    assignLoad(@Body() body: Record<string, unknown>) {
        return this.tripsService.assignLoad(body as never)
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

    /** Driver 5.1 — start route. */
    @Patch(':id/start')
    start(@Param('id') id: string) {
        return this.tripsService.startTrip(id)
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

    @Patch(':id/stops/:stopId/arrive')
    arriveStop(@Param('id') id: string, @Param('stopId') stopId: string) {
        return this.tripsService.arriveStop(id, stopId)
    }

    @Patch(':id/stops/:stopId/pod')
    saveStopPod(
        @Param('id') id: string,
        @Param('stopId') stopId: string,
        @Body() body: Record<string, unknown>,
    ) {
        return this.tripsService.saveStopPod(id, stopId, body as never)
    }

    @Patch(':id/stops/:stopId/deliver')
    deliverStop(
        @Param('id') id: string,
        @Param('stopId') stopId: string,
        @Body() body: Record<string, unknown>,
    ) {
        return this.tripsService.deliverStop(id, stopId, body as never)
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
