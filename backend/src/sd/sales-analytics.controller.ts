import { Body, Controller, Get, Put, Query } from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../auth/auth.decorator'
import { RequirePermission } from '../permissions/permission.guard'
import { SalesAnalyticsQueryDto } from './dto/sales-analytics.dto'
import {
    SalesPerformanceQueryDto,
    SalesTargetsQueryDto,
    SaveSalesTargetsDto,
} from './dto/sales-performance.dto'
import { SalesAnalyticsService } from './sales-analytics.service'
import { SalesPerformanceService } from './sales-performance.service'

/** Read-only SD sales reporting (revenue, orders, channel split, trend, top products). */
@Controller('sd/analytics')
export class SalesAnalyticsController {
    constructor(
        private readonly analytics: SalesAnalyticsService,
        private readonly performance: SalesPerformanceService,
    ) {}

    @Get('sales')
    @RequirePermission('sd.reports', 'read')
    sales(@Query() query: SalesAnalyticsQueryDto) {
        return this.analytics.sales(query)
    }

    /** YTD / month scorecard: sales, GPR, quantity, collections and sales by location. */
    @Get('performance')
    @RequirePermission('sd.reports', 'read')
    salesPerformance(@Query() query: SalesPerformanceQueryDto) {
        return this.performance.performance(query)
    }

    /** Monthly sales targets and collection quotas of a year (12 months). */
    @Get('targets')
    @RequirePermission('sd.reports', 'read')
    targets(@Query() query: SalesTargetsQueryDto) {
        return this.performance.targets(query.year)
    }

    @Put('targets')
    @RequirePermission('sd.reports', 'update')
    saveTargets(
        @Body() dto: SaveSalesTargetsDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.performance.saveTargets(dto.year, dto.months, user?.id)
    }
}
