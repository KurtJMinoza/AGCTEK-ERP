import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common'
import { RequirePermission } from '../../permissions/permission.guard'
import { OcularTripsService } from './ocular-trips.service'

const OCULAR_TRIP_RESOURCES = ['scm.trips', 'scm.trip-planning'] as const

/**
 * Ocular runs (trip purpose OCULAR). Reads use the normal `GET /scm/trips?purpose=OCULAR`;
 * start / complete / cancel use `PATCH /scm/trips/:id/status`.
 */
@Controller('scm/ocular-trips')
export class OcularTripsController {
    constructor(private readonly ocular: OcularTripsService) {}

    @Post()
    @RequirePermission(OCULAR_TRIP_RESOURCES, 'create')
    create(@Body() body: Record<string, unknown>) {
        return this.ocular.create(body as never)
    }

    @Patch(':id')
    @RequirePermission(OCULAR_TRIP_RESOURCES, 'update')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.ocular.update(id, body as never)
    }

    @Post(':id/stops')
    @RequirePermission(OCULAR_TRIP_RESOURCES, 'update')
    addStop(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.ocular.addStop(id, body as never)
    }

    @Patch(':id/stops/sequence')
    @RequirePermission(OCULAR_TRIP_RESOURCES, 'update')
    reorder(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.ocular.reorderStops(id, body)
    }

    @Patch(':id/stops/:stopId')
    @RequirePermission(OCULAR_TRIP_RESOURCES, 'update')
    updateStop(
        @Param('id') id: string,
        @Param('stopId') stopId: string,
        @Body() body: Record<string, unknown>,
    ) {
        return this.ocular.updateStop(id, stopId, body as never)
    }

    @Patch(':id/stops/:stopId/status')
    @RequirePermission(OCULAR_TRIP_RESOURCES, 'update')
    setStopStatus(
        @Param('id') id: string,
        @Param('stopId') stopId: string,
        @Body() body: Record<string, unknown>,
    ) {
        return this.ocular.setStopStatus(id, stopId, body as never)
    }

    @Delete(':id/stops/:stopId')
    @RequirePermission(OCULAR_TRIP_RESOURCES, 'update')
    removeStop(@Param('id') id: string, @Param('stopId') stopId: string) {
        return this.ocular.removeStop(id, stopId)
    }
}
