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

@Controller('scm/demand')
export class DemandPlanController {
    constructor(
        private readonly demandPlanService: DemandPlanService,
        private readonly demandSalesService: DemandSalesService,
    ) {}

    @Get('horizon-presets')
    presets() {
        return this.demandPlanService.presets()
    }

    @Get('past-sales')
    pastSales(@Query() query: PastSalesQuery) {
        return this.demandSalesService.pastSales(query)
    }

    @Post('plans/:id/generate-forecast')
    generateForecast(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
        @Headers('x-user-id') userId?: string,
    ) {
        return this.demandPlanService.generateForecast(id, body, userId)
    }

    @Get('plans')
    list(@Query() query: Record<string, string>) {
        return this.demandPlanService.list(query)
    }

    @Get('plans/:id')
    findOne(@Param('id') id: string) {
        return this.demandPlanService.findOne(id)
    }

    @Post('plans')
    create(
        @Body() body: Record<string, unknown>,
        @Headers('x-user-id') userId?: string,
    ) {
        return this.demandPlanService.create(body, userId)
    }

    @Patch('plans/:id')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.demandPlanService.update(id, body)
    }

    @Get('plans/:id/grid')
    grid(@Param('id') id: string, @Query() query: GridQuery) {
        return this.demandPlanService.grid(id, query)
    }

    @Patch('plans/:id/cells')
    adjustCells(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
        @Headers('x-user-id') userId?: string,
    ) {
        return this.demandPlanService.adjustCells(id, body, userId)
    }

    @Post('plans/:id/publish')
    publish(@Param('id') id: string) {
        return this.demandPlanService.publish(id)
    }
}
