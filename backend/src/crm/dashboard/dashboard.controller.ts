import { Controller, Get, Query } from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { RequirePermission } from '../../permissions/permission.guard'
import {
    CrmDashboardCadenceQueryDto,
    CrmDashboardLeadSourcesQueryDto,
    CrmDashboardPipelineQueryDto,
    CrmDashboardQueryDto,
    CrmDashboardStalledQueryDto,
} from './dashboard.dto'
import { CrmDashboardService } from './dashboard.service'

@Controller('crm/dashboard')
export class CrmDashboardController {
    constructor(private readonly dashboard: CrmDashboardService) {}

    @Get()
    @RequirePermission('crm.dashboard', 'read')
    get(@Query() query: CrmDashboardQueryDto) {
        return this.dashboard.get(query)
    }

    @Get('cadence')
    @RequirePermission('crm.dashboard', 'read')
    cadence(
        @Query() query: CrmDashboardCadenceQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.dashboard.cadence(user.id, query)
    }

    @Get('pipeline')
    @RequirePermission('crm.dashboard', 'read')
    pipeline(
        @Query() query: CrmDashboardPipelineQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.dashboard.pipelineMetrics(user.id, query)
    }

    @Get('stalled')
    @RequirePermission('crm.dashboard', 'read')
    stalled(
        @Query() query: CrmDashboardStalledQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.dashboard.stalled(user.id, query)
    }

    @Get('lead-sources')
    @RequirePermission('crm.dashboard', 'read')
    leadSources(
        @Query() query: CrmDashboardLeadSourcesQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.dashboard.leadSources(user.id, query)
    }
}
