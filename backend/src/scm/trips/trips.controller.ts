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
import { RequirePermission } from '../../permissions/permission.guard'

@Controller('scm/trips')
export class TripsController {
    constructor(private readonly tripsService: TripsService) {}

    @Get()
    @RequirePermission(['scm.trips', 'scm.trip-planning', 'scm.tracking'], 'read')
    findAll(
        @Query() query: ListQuery & { vehicleId?: string; driverId?: string },
    ) {
        return this.tripsService.findAll(query)
    }

    /** Driver mobile — active ASSIGNED / IN_TRANSIT trip. */
    @Get('active')
    @RequirePermission(['scm.trips', 'scm.trip-planning', 'scm.tracking'], 'read')
    findActive(@Query('driverId') driverId: string) {
        return this.tripsService.findActiveForDriver(driverId)
    }

    /** @deprecated Use POST /scm/tms/load-plans/:id/lines (cargo-first load building). */
    @Post('assign-load')
    @RequirePermission(['scm.trips', 'scm.trip-planning'], 'update')
    assignLoad(@Body() body: Record<string, unknown>) {
        return this.tripsService.assignLoad(body as never)
    }

    @Get(':id')
    @RequirePermission(['scm.trips', 'scm.trip-planning', 'scm.tracking'], 'read')
    findOne(@Param('id') id: string) {
        return this.tripsService.findOne(id)
    }

    /** @deprecated with shipment stops — use POST /scm/tms/trips from a READY load plan. */
    @Post()
    @RequirePermission('scm.trips', 'create')
    create(@Body() body: Record<string, unknown>) {
        return this.tripsService.create(body as never)
    }

    @Patch(':id')
    @RequirePermission('scm.trips', 'update')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.tripsService.update(id, body as never)
    }

    @Patch(':id/status')
    @RequirePermission('scm.trips', 'update')
    updateStatus(
        @Param('id') id: string,
        @Body() body: { status?: TripStatus },
    ) {
        return this.tripsService.updateStatus(id, body.status as TripStatus)
    }

    /** Driver 5.1 — start route. Driver endpoints require `x-driver-id` = trip's assigned driver. */
    @Patch(':id/start')
    @RequirePermission('scm.trips', 'update')
    start(@Param('id') id: string, @Headers('x-driver-id') driverId?: string) {
        return this.tripsService.startTrip(id, driverId)
    }

    @Post(':id/stops')
    @RequirePermission('scm.trips', 'update')
    addStop(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.tripsService.addStop(id, body as never)
    }

    @Patch(':id/stops/:stopId')
    @RequirePermission('scm.trips', 'update')
    updateStop(
        @Param('id') id: string,
        @Param('stopId') stopId: string,
        @Body() body: Record<string, unknown>,
    ) {
        return this.tripsService.updateStop(id, stopId, body as never)
    }

    @Patch(':id/stops/:stopId/arrive')
    @RequirePermission('scm.trips', 'update')
    arriveStop(
        @Param('id') id: string,
        @Param('stopId') stopId: string,
        @Body() body: Record<string, unknown>,
        @Headers('x-driver-id') driverId?: string,
    ) {
        return this.tripsService.arriveStop(id, stopId, driverId, body as never)
    }

    @Patch(':id/stops/:stopId/pod')
    @RequirePermission('scm.trips', 'update')
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
    @RequirePermission('scm.trips', 'update')
    deliverStop(
        @Param('id') id: string,
        @Param('stopId') stopId: string,
        @Body() body: Record<string, unknown>,
        @Headers('x-driver-id') driverId?: string,
    ) {
        return this.tripsService.deliverStop(id, stopId, body as never, driverId)
    }

    @Delete(':id/stops/:stopId')
    @RequirePermission('scm.trips', 'delete')
    removeStop(@Param('id') id: string, @Param('stopId') stopId: string) {
        return this.tripsService.removeStop(id, stopId)
    }

    @Delete(':id')
    @RequirePermission('scm.trips', 'delete')
    remove(@Param('id') id: string) {
        return this.tripsService.remove(id)
    }
}
