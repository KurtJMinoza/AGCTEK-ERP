import {
    Body,
    Controller,
    Delete,
    Get,
    Headers,
    HttpCode,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common'
import type { ListQuery } from '../scm.utils'
import { TmsLoadPlansService } from './tms-load-plans.service'
import { TmsTripsService } from './tms-trips.service'
import { TmsRoutePreviewService } from './tms-route-preview.service'
import { RequirePermission } from '../../permissions/permission.guard'

/**
 * Cargo-first TMS: Load Building (what is on which vehicle) → READY load plan
 * → Trip Planning (stops derived from cargo, driver, dispatch).
 */
@Controller('scm/tms')
export class TmsController {
    constructor(
        private readonly loadPlans: TmsLoadPlansService,
        private readonly trips: TmsTripsService,
        private readonly routePreviews: TmsRoutePreviewService,
    ) {}

    // ─── Load building ──────────────────────────────────────────────────────

    @Get('load-plans')
    @RequirePermission(['scm.load-building', 'scm.trip-planning', 'scm.trips'], 'read')
    listLoadPlans(@Query() query: ListQuery & { vehicleId?: string; active?: string }) {
        return this.loadPlans.findAll(query)
    }

    @Post('load-plans')
    @RequirePermission('scm.load-building', 'create')
    createLoadPlan(
        @Body() body: Record<string, unknown>,
        @Headers('x-user-id') userId?: string,
    ) {
        return this.loadPlans.create(body, userId)
    }

    @Get('shipment-lines/available')
    @RequirePermission(['scm.load-building', 'scm.trip-planning', 'scm.trips'], 'read')
    availableLines(@Query() query: { search?: string }) {
        return this.loadPlans.availableLines(query)
    }

    @Get('load-plans/:id')
    @RequirePermission(['scm.load-building', 'scm.trip-planning', 'scm.trips'], 'read')
    getLoadPlan(@Param('id') id: string) {
        return this.loadPlans.findOne(id)
    }

    @Post('load-plans/:id/lines')
    @RequirePermission('scm.load-building', 'update')
    addLine(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.loadPlans.addLine(id, body)
    }

    @Delete('load-plans/:id/lines/:lineId')
    @RequirePermission('scm.load-building', 'delete')
    removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
        return this.loadPlans.removeLine(id, lineId)
    }

    @Post('load-plans/:id/validate')
    @RequirePermission('scm.load-building', 'update')
    validateLoadPlan(@Param('id') id: string) {
        return this.loadPlans.validate(id)
    }

    @Post('load-plans/:id/ready')
    @RequirePermission('scm.load-building', 'update')
    readyLoadPlan(@Param('id') id: string) {
        return this.loadPlans.ready(id)
    }

    @Post('load-plans/:id/reopen')
    @RequirePermission('scm.load-building', 'update')
    reopenLoadPlan(@Param('id') id: string) {
        return this.loadPlans.reopen(id)
    }

    @Post('load-plans/:id/cancel')
    @RequirePermission('scm.load-building', 'update')
    cancelLoadPlan(@Param('id') id: string) {
        return this.loadPlans.cancel(id)
    }

    /** Stateless route / ETA preview for a READY load — creates nothing. */
    @Post('load-plans/:id/route-preview')
    @RequirePermission(['scm.load-building', 'scm.trip-planning', 'scm.trips'], 'read')
    @HttpCode(200)
    routePreview(@Param('id') id: string, @Body() body: Record<string, unknown> = {}) {
        return this.routePreviews.preview(id, body ?? {})
    }

    // ─── Trip planning ──────────────────────────────────────────────────────

    @Get('trip-candidates')
    @RequirePermission(['scm.load-building', 'scm.trip-planning', 'scm.trips'], 'read')
    tripCandidates() {
        return this.trips.candidates()
    }

    @Get('trips')
    @RequirePermission(['scm.load-building', 'scm.trip-planning', 'scm.trips'], 'read')
    listTrips(@Query() query: ListQuery & { vehicleId?: string }) {
        return this.trips.findAll(query)
    }

    @Post('trips')
    @RequirePermission('scm.trip-planning', 'create')
    createTrip(@Body() body: Record<string, unknown>) {
        return this.trips.create(body)
    }

    @Get('trips/:id')
    @RequirePermission(['scm.load-building', 'scm.trip-planning', 'scm.trips'], 'read')
    getTrip(@Param('id') id: string) {
        return this.trips.findOne(id)
    }

    @Patch('trips/:id')
    @RequirePermission('scm.trip-planning', 'update')
    updateTrip(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.trips.update(id, body)
    }

    @Patch('trips/:id/stops/sequence')
    @RequirePermission('scm.trip-planning', 'update')
    reorderStops(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.trips.reorderStops(id, body)
    }

    @Post('trips/:id/validate')
    @RequirePermission('scm.trip-planning', 'update')
    validateTrip(@Param('id') id: string) {
        return this.trips.validate(id)
    }

    @Post('trips/:id/dispatch')
    @RequirePermission('scm.trip-planning', 'update')
    dispatchTrip(@Param('id') id: string) {
        return this.trips.dispatch(id)
    }

    @Post('trips/:id/cancel')
    @RequirePermission('scm.trip-planning', 'update')
    cancelTrip(@Param('id') id: string) {
        return this.trips.cancel(id)
    }
}
