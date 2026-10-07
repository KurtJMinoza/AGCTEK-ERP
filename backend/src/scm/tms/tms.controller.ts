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
    listLoadPlans(@Query() query: ListQuery & { vehicleId?: string; active?: string }) {
        return this.loadPlans.findAll(query)
    }

    @Post('load-plans')
    createLoadPlan(
        @Body() body: Record<string, unknown>,
        @Headers('x-user-id') userId?: string,
    ) {
        return this.loadPlans.create(body, userId)
    }

    @Get('shipment-lines/available')
    availableLines(@Query() query: { search?: string }) {
        return this.loadPlans.availableLines(query)
    }

    @Get('load-plans/:id')
    getLoadPlan(@Param('id') id: string) {
        return this.loadPlans.findOne(id)
    }

    @Post('load-plans/:id/lines')
    addLine(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.loadPlans.addLine(id, body)
    }

    @Delete('load-plans/:id/lines/:lineId')
    removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
        return this.loadPlans.removeLine(id, lineId)
    }

    @Post('load-plans/:id/validate')
    validateLoadPlan(@Param('id') id: string) {
        return this.loadPlans.validate(id)
    }

    @Post('load-plans/:id/ready')
    readyLoadPlan(@Param('id') id: string) {
        return this.loadPlans.ready(id)
    }

    @Post('load-plans/:id/reopen')
    reopenLoadPlan(@Param('id') id: string) {
        return this.loadPlans.reopen(id)
    }

    @Post('load-plans/:id/cancel')
    cancelLoadPlan(@Param('id') id: string) {
        return this.loadPlans.cancel(id)
    }

    /** Stateless route / ETA preview for a READY load — creates nothing. */
    @Post('load-plans/:id/route-preview')
    @HttpCode(200)
    routePreview(@Param('id') id: string, @Body() body: Record<string, unknown> = {}) {
        return this.routePreviews.preview(id, body ?? {})
    }

    // ─── Trip planning ──────────────────────────────────────────────────────

    @Get('trip-candidates')
    tripCandidates() {
        return this.trips.candidates()
    }

    @Get('trips')
    listTrips(@Query() query: ListQuery & { vehicleId?: string }) {
        return this.trips.findAll(query)
    }

    @Post('trips')
    createTrip(@Body() body: Record<string, unknown>) {
        return this.trips.create(body)
    }

    @Get('trips/:id')
    getTrip(@Param('id') id: string) {
        return this.trips.findOne(id)
    }

    @Patch('trips/:id')
    updateTrip(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.trips.update(id, body)
    }

    @Patch('trips/:id/stops/sequence')
    reorderStops(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.trips.reorderStops(id, body)
    }

    @Post('trips/:id/validate')
    validateTrip(@Param('id') id: string) {
        return this.trips.validate(id)
    }

    @Post('trips/:id/dispatch')
    dispatchTrip(@Param('id') id: string) {
        return this.trips.dispatch(id)
    }

    @Post('trips/:id/cancel')
    cancelTrip(@Param('id') id: string) {
        return this.trips.cancel(id)
    }
}
