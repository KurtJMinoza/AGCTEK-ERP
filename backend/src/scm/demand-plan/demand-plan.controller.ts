import {
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common'
import { DemandPlanService, type GridQuery } from './demand-plan.service'
import { DemandSalesService, type PastSalesQuery } from './demand-plan.sales'
import { RequirePermission } from '../../permissions/permission.guard'

@Controller('scm/demand')
export class DemandPlanController {
    constructor(
        private readonly demandPlanService: DemandPlanService,
        private readonly demandSalesService: DemandSalesService,
    ) {}

    @Get('horizon-presets')
    @RequirePermission('scm.demand-planning', 'read')
    presets() {
        return this.demandPlanService.presets()
    }

    @Get('past-sales')
    @RequirePermission('scm.demand-planning', 'read')
    pastSales(@Query() query: PastSalesQuery) {
        return this.demandSalesService.pastSales(query)
    }

    @Post('plans/:id/generate-forecast')
    @RequirePermission('scm.demand-planning', 'update')
    generateForecast(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
        @Headers('x-user-id') userId?: string,
    ) {
        return this.demandPlanService.generateForecast(id, body, userId)
    }

    @Get('plans')
    @RequirePermission('scm.demand-planning', 'read')
    list(@Query() query: Record<string, string>) {
        return this.demandPlanService.list(query)
    }

    @Get('plans/:id')
    @RequirePermission('scm.demand-planning', 'read')
    findOne(@Param('id') id: string) {
        return this.demandPlanService.findOne(id)
    }

    @Post('plans')
    @RequirePermission('scm.demand-planning', 'create')
    create(
        @Body() body: Record<string, unknown>,
        @Headers('x-user-id') userId?: string,
    ) {
        return this.demandPlanService.create(body, userId)
    }

    @Patch('plans/:id')
    @RequirePermission('scm.demand-planning', 'update')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.demandPlanService.update(id, body)
    }

    @Get('plans/:id/grid')
    @RequirePermission('scm.demand-planning', 'read')
    grid(@Param('id') id: string, @Query() query: GridQuery) {
        return this.demandPlanService.grid(id, query)
    }

    @Patch('plans/:id/cells')
    @RequirePermission('scm.demand-planning', 'update')
    adjustCells(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
        @Headers('x-user-id') userId?: string,
    ) {
        return this.demandPlanService.adjustCells(id, body, userId)
    }

    @Post('plans/:id/publish')
    @RequirePermission('scm.demand-planning', 'update')
    publish(@Param('id') id: string) {
        return this.demandPlanService.publish(id)
    }
}
