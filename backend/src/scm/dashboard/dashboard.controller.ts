import { Controller, Get } from '@nestjs/common'
import { DashboardService } from './dashboard.service'
import { RequirePermission } from '../../permissions/permission.guard'

@Controller('scm/dashboard')
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) {}

    @Get('summary')
    @RequirePermission('scm.supply-chain-dashboard', 'read')
    summary() {
        return this.dashboardService.summary()
    }
}
