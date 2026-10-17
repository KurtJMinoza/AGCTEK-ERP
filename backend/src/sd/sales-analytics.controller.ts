import { Controller, Get, Query } from '@nestjs/common'
import { RequirePermission } from '../permissions/permission.guard'
import { SalesAnalyticsQueryDto } from './dto/sales-analytics.dto'
import { SalesAnalyticsService } from './sales-analytics.service'

/** Read-only SD sales reporting (revenue, orders, channel split, trend, top products). */
@Controller('sd/analytics')
export class SalesAnalyticsController {
    constructor(private readonly analytics: SalesAnalyticsService) {}

    @Get('sales')
    @RequirePermission('sd.reports', 'read')
    sales(@Query() query: SalesAnalyticsQueryDto) {
        return this.analytics.sales(query)
    }
}
