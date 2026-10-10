import { Controller, Get, Query } from '@nestjs/common'
import { RequirePermission } from '../../permissions/permission.guard'
import { CrmDashboardQueryDto } from './dashboard.dto'
import { CrmDashboardService } from './dashboard.service'

@Controller('crm/dashboard')
export class CrmDashboardController {
    constructor(private readonly dashboard: CrmDashboardService) {}

    @Get()
    @RequirePermission('crm.dashboard', 'read')
    get(@Query() query: CrmDashboardQueryDto) {
        return this.dashboard.get(query)
    }
}
