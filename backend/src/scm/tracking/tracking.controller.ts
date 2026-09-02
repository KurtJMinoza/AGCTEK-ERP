import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { TrackingService } from './tracking.service'

@Controller('scm/tracking')
export class TrackingController {
    constructor(private readonly trackingService: TrackingService) {}

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

    @Post('ping')
    ping(@Body() body: Record<string, unknown>) {
        return this.trackingService.ping(body as never)
    }
}
