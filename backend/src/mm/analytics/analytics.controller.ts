import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { AnalyticsService } from './analytics.service'
import { AnalyticsQueryDto } from './dto/analytics.dto'
import { MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = [...mmFeatures('reports-analytics', 'stock-reports', 'inventory-valuation-reports', 'stock-aging', 'dead-stock', 'inventory-turnover', 'procurement-analytics', 'supplier-performance-reports', 'warehouse-performance', 'stock-variance', 'quality-analytics'), 'mm.dashboard']

@Controller('mm/analytics')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AnalyticsController {
    constructor(private analytics: AnalyticsService) {}

    @Get('inventory')
    @MmRead(READERS)
    inventory(@Query() query: AnalyticsQueryDto) {
        return this.analytics.getInventory(query)
    }

    @Get('procurement')
    @MmRead(READERS)
    procurement(@Query() query: AnalyticsQueryDto) {
        return this.analytics.getProcurement(query)
    }

    @Get('warehouse')
    @MmRead(READERS)
    warehouse(@Query() query: AnalyticsQueryDto) {
        return this.analytics.getWarehouse(query)
    }

    @Get('quality')
    @MmRead(READERS)
    quality(@Query() query: AnalyticsQueryDto) {
        return this.analytics.getQuality(query)
    }

    @Get('valuation')
    @MmRead(READERS)
    valuation(@Query() query: AnalyticsQueryDto) {
        return this.analytics.getValuation(query)
    }
}
