import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Query,
} from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { RequirePermission } from '../../permissions/permission.guard'
import type { ListQuery } from '../scm.utils'
import {
    DamageReportsService,
    type CreateDamageReportInput,
} from './damage-reports.service'

const READ_CODES = [
    'scm.shipments',
    'scm.load-building',
    'scm.trip-planning',
] as const

/**
 * Damage reports nested under a shipment — the delivery history stays intact and the report is
 * the SCM-side record that the SD Sales Return (Phase 3) and MM customer-return intake (Phase 4)
 * will link to. Reuses the `scm.shipments` permission surface (there is no dedicated code yet).
 */
@Controller('scm/shipments/:shipmentId/damage-reports')
export class DamageReportsController {
    constructor(private readonly damageReports: DamageReportsService) {}

    @Get()
    @RequirePermission([...READ_CODES], 'read')
    list(@Param('shipmentId') shipmentId: string, @Query() query: ListQuery) {
        return this.damageReports.listForShipment(shipmentId, query)
    }

    @Post()
    @RequirePermission('scm.shipments', 'create')
    create(
        @Param('shipmentId') shipmentId: string,
        @Body() body: Record<string, unknown>,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.damageReports.createForShipment(
            shipmentId,
            body as CreateDamageReportInput,
            user,
        )
    }

    @Get(':id')
    @RequirePermission([...READ_CODES], 'read')
    findOne(@Param('shipmentId') shipmentId: string, @Param('id') id: string) {
        return this.damageReports.findOne(id)
    }

    @Post(':id/cancel')
    @HttpCode(200)
    @RequirePermission('scm.shipments', 'update')
    cancel(
        @Param('shipmentId') shipmentId: string,
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.damageReports.cancel(id, body, user)
    }

    /**
     * SCM → SD handoff: creates a REQUESTED SD Sales Return from a submitted, resolvable report.
     * Exactly one return per report (idempotent on damageReportId). The SD permission
     * (sd.sales-returns:create) is asserted inside the SD service, mirroring the CRM handoff.
     */
    @Post(':id/initiate-return')
    @HttpCode(200)
    @RequirePermission('scm.shipments', 'update')
    initiateReturn(
        @Param('shipmentId') shipmentId: string,
        @Param('id') id: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.damageReports.initiateSalesReturn(id, user)
    }
}
