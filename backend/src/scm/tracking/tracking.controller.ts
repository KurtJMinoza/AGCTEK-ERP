import {
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Post,
    Query,
} from '@nestjs/common'
import { TrackingService } from './tracking.service'
import { GeofencesService } from '../geofences/geofences.service'
import type { ListQuery } from '../scm.utils'
import { RequirePermission } from '../../permissions/permission.guard'

@Controller('scm/tracking')
export class TrackingController {
    constructor(
        private readonly trackingService: TrackingService,
        private readonly geofencesService: GeofencesService,
    ) {}

    @Get('fleet')
    @RequirePermission(['scm.tracking', 'scm.vehicles', 'scm.trips'], 'read')
    fleet(@Query() query: { status?: string; search?: string }) {
        return this.trackingService.fleet(query)
    }

    @Get('vehicles/:vehicleId/latest')
    @RequirePermission(['scm.tracking', 'scm.vehicles', 'scm.trips'], 'read')
    latest(@Param('vehicleId') vehicleId: string) {
        return this.trackingService.latest(vehicleId)
    }

    @Get('vehicles/:vehicleId/history')
    @RequirePermission(['scm.tracking', 'scm.vehicles', 'scm.trips'], 'read')
    history(
        @Param('vehicleId') vehicleId: string,
        @Query() query: { from?: string; to?: string; limit?: string },
    ) {
        return this.trackingService.history(vehicleId, query)
    }

    /** Paginated audit trail of stored GpsLog rows (read-only). */
    @Get('vehicles/:vehicleId/telematics-history')
    @RequirePermission(['scm.tracking', 'scm.vehicles', 'scm.trips'], 'read')
    telematicsHistory(
        @Param('vehicleId') vehicleId: string,
        @Query()
        query: ListQuery & { from?: string; to?: string; source?: string },
    ) {
        return this.trackingService.telematicsHistory(vehicleId, query)
    }

    /** Manual / internal ping by vehicleId (driver app / tools). */
    @Post('ping')
    @RequirePermission(['scm.tracking', 'scm.trips'], 'create')
    ping(@Body() body: Record<string, unknown>) {
        return this.trackingService.ping(body as never)
    }

    /**
     * GPS ingest → GpsLog (flespi HTTP stream fallback or flat body).
     * Preferred path: Nest MQTT → flespi (no tunnel).
     * Auth: X-Flespi-Token | Authorization: Bearer
     *   (= TRACKING_INGEST_TOKEN / FLESPI_INGEST_TOKEN)
     * Ident: flespi 14-digit JT808 ident → Vehicle.telematicsDeviceId
     */
    @Post('ingest')
    ingest(
        @Body() body: unknown,
        @Headers('x-flespi-token') flespiToken?: string,
        @Headers('authorization') authorization?: string,
    ) {
        this.trackingService.assertIngestAuth({
            flespiToken,
            authorization,
        })
        return this.trackingService.ingest(body)
    }

    /**
     * Tile38 SETHOOK callback — enter/exit for circular hubs.
     * Configure TILE38_HOOK_BASE_URL (e.g. http://127.0.0.1:3001/api/v1)
     * so Tile38 can reach this API — see docs/SCM_TILE38_STANDALONE.md.
     */
    @Post('geofence-hook')
    geofenceHook(@Body() body: Record<string, unknown>) {
        return this.geofencesService.handleTile38Hook(body)
    }
}
