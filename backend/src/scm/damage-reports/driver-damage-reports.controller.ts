import {
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Post,
} from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { RequirePermission } from '../../permissions/permission.guard'
import {
    DamageReportsService,
    type DriverDamageReportInput,
} from './damage-reports.service'

/**
 * Driver app: optional damage evidence on a stop the driver just delivered. Same guard as the
 * other driver execution routes (`scm.trips:update` + `x-driver-id` = trip's assigned driver).
 * Creates the same SCM DamageReport the back office files; SD return stays a staff action.
 */
@Controller('scm/trips/:tripId/stops/:stopId/damage-reports')
export class DriverDamageReportsController {
    constructor(private readonly damageReports: DamageReportsService) {}

    @Get()
    @RequirePermission(['scm.trips', 'scm.trip-planning', 'scm.tracking'], 'read')
    context(
        @Param('tripId') tripId: string,
        @Param('stopId') stopId: string,
        @Headers('x-driver-id') driverId?: string,
    ) {
        return this.damageReports.driverStopContext(tripId, stopId, driverId)
    }

    @Post()
    @RequirePermission('scm.trips', 'update')
    create(
        @Param('tripId') tripId: string,
        @Param('stopId') stopId: string,
        @Body() body: Record<string, unknown>,
        @CurrentUser() user: AuthRequestUser,
        @Headers('x-driver-id') driverId?: string,
    ) {
        return this.damageReports.createFromDriver(
            tripId,
            stopId,
            body as DriverDamageReportInput,
            driverId,
            user,
        )
    }
}
