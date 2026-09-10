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

@Controller('scm/tracking')
export class TrackingController {
    constructor(
        private readonly trackingService: TrackingService,
        private readonly geofencesService: GeofencesService,
    ) {}

    @Get('fleet')
    fleet(@Query() query: { status?: string; search?: string }) {
        return this.trackingService.fleet(query)
    }

    @Get('vehicles/:vehicleId/latest')
    latest(@Param('vehicleId') vehicleId: string) {
        return this.trackingService.latest(vehicleId)
    }

    @Get('vehicles/:vehicleId/history')
    history(
        @Param('vehicleId') vehicleId: string,
        @Query() query: { from?: string; to?: string; limit?: string },
    ) {
        return this.trackingService.history(vehicleId, query)
    }

    /** Manual / internal ping by vehicleId (driver app / tools). */
    @Post('ping')
    ping(@Body() body: Record<string, unknown>) {
        return this.trackingService.ping(body as never)
    }

    /**
     * GPS ingest → GpsLog (flespi HTTP stream fallback, Traccar forward, or flat).
     * Preferred path for VL502 testing: Nest MQTT → flespi (no tunnel).
     * Auth: X-Flespi-Token | X-Traccar-Token | Authorization: Bearer
     *   (= TRACKING_INGEST_TOKEN / FLESPI_INGEST_TOKEN / TRACCAR_INGEST_TOKEN)
     * Ident: flespi 14-digit JT808 ident → Vehicle.telematicsDeviceId
     */
    @Post('ingest')
    ingest(
        @Body() body: unknown,
        @Headers('x-traccar-token') traccarToken?: string,
        @Headers('x-flespi-token') flespiToken?: string,
        @Headers('authorization') authorization?: string,
    ) {
        this.trackingService.assertIngestAuth({
            traccarToken,
            flespiToken,
            authorization,
        })
        return this.trackingService.ingest(body)
    }

    /**
     * Tile38 SETHOOK callback — enter/exit for circular hubs.
     * Configure TILE38_HOOK_BASE_URL so Tile38 can reach this API.
     */
    @Post('geofence-hook')
    geofenceHook(@Body() body: Record<string, unknown>) {
        return this.geofencesService.handleTile38Hook(body)
    }
}
