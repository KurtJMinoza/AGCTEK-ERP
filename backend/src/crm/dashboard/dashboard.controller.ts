import { Controller, Get, Query } from '@nestjs/common'
import { RequirePermission } from '../../permissions/permission.guard'
import { MODULE_CODES } from '../../permissions/permissions.constants'
import { CrmDashboardQueryDto } from './dashboard.dto'
import { CrmDashboardService } from './dashboard.service'

@Controller('crm/dashboard')
export class CrmDashboardController {
    constructor(private readonly dashboard: CrmDashboardService) {}

    @Get()
    @RequirePermission(MODULE_CODES.CRM, 'read')
    get(@Query() query: CrmDashboardQueryDto) {
        return this.dashboard.get(query)
    }
}
