import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { ReportsService } from './reports.service'
import { ReportsQueryDto } from './dto/reports.dto'

@Controller('mm/reports')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ReportsController {
    constructor(private reports: ReportsService) {}

    @Get('stock')
    getStock(@Query() query: ReportsQueryDto) {
        return this.reports.getStock(query)
    }

    @Get('inventory-valuation')
    getInventoryValuation(@Query() query: ReportsQueryDto) {
        return this.reports.getInventoryValuation(query)
    }

    @Get('aging')
    getAging(@Query() query: ReportsQueryDto) {
        return this.reports.getAging(query)
    }

    @Get('dead-stock')
    getDeadStock(@Query() query: ReportsQueryDto) {
        return this.reports.getDeadStock(query)
    }

    @Get('turnover')
    getTurnover(@Query() query: ReportsQueryDto) {
        return this.reports.getTurnover(query)
    }

    @Get('procurement')
    getProcurement(@Query() query: ReportsQueryDto) {
        return this.reports.getProcurement(query)
    }

    @Get('supplier-performance')
    getSupplierPerformance(@Query() query: ReportsQueryDto) {
        return this.reports.getSupplierPerformance(query)
    }

    @Get('warehouse-performance')
    getWarehousePerformance(@Query() query: ReportsQueryDto) {
        return this.reports.getWarehousePerformance(query)
    }

    @Get('stock-variance')
    getStockVariance(@Query() query: ReportsQueryDto) {
        return this.reports.getStockVariance(query)
    }
}
