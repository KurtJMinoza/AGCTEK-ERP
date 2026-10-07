import {
    Body,
    Controller,
    Delete,
    Get,
    Headers,
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

    /** @deprecated Use POST /scm/tms/load-plans/:id/lines (cargo-first load building). */
    @Post('assign-load')
    assignLoad(@Body() body: Record<string, unknown>) {
        return this.tripsService.assignLoad(body as never)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.tripsService.findOne(id)
    }

    /** @deprecated with shipment stops — use POST /scm/tms/trips from a READY load plan. */
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

    /** Driver 5.1 — start route. Driver endpoints require `x-driver-id` = trip's assigned driver. */
    @Patch(':id/start')
    start(@Param('id') id: string, @Headers('x-driver-id') driverId?: string) {
        return this.tripsService.startTrip(id, driverId)
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
    arriveStop(
        @Param('id') id: string,
        @Param('stopId') stopId: string,
        @Body() body: Record<string, unknown>,
        @Headers('x-driver-id') driverId?: string,
    ) {
        return this.tripsService.arriveStop(id, stopId, driverId, body as never)
    }

    @Patch(':id/stops/:stopId/pod')
    saveStopPod(
        @Param('id') id: string,
        @Param('stopId') stopId: string,
        @Body() body: Record<string, unknown>,
        @Headers('x-driver-id') driverId?: string,
    ) {
        return this.tripsService.saveStopPod(id, stopId, body as never, driverId)
    }

    /** outcome DELIVERED → stop COMPLETED; outcome FAILED requires reasonCode. */
    @Patch(':id/stops/:stopId/deliver')
    deliverStop(
        @Param('id') id: string,
        @Param('stopId') stopId: string,
        @Body() body: Record<string, unknown>,
        @Headers('x-driver-id') driverId?: string,
    ) {
        return this.tripsService.deliverStop(id, stopId, body as never, driverId)
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
