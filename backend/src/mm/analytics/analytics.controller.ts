import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { AnalyticsService } from './analytics.service'
import { AnalyticsQueryDto } from './dto/analytics.dto'

@Controller('mm/analytics')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AnalyticsController {
    constructor(private analytics: AnalyticsService) {}

    @Get('inventory')
    inventory(@Query() query: AnalyticsQueryDto) {
        return this.analytics.getInventory(query)
    }

    @Get('procurement')
    procurement(@Query() query: AnalyticsQueryDto) {
        return this.analytics.getProcurement(query)
    }

    @Get('warehouse')
    warehouse(@Query() query: AnalyticsQueryDto) {
        return this.analytics.getWarehouse(query)
    }

    @Get('quality')
    quality(@Query() query: AnalyticsQueryDto) {
        return this.analytics.getQuality(query)
    }

    @Get('valuation')
    valuation(@Query() query: AnalyticsQueryDto) {
        return this.analytics.getValuation(query)
    }
}
