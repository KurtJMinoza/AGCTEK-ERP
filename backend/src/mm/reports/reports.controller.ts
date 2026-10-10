import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { ReportsService } from './reports.service'
import { ReportsQueryDto } from './dto/reports.dto'
import { MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = [...mmFeatures('reports-analytics', 'stock-reports', 'inventory-valuation-reports', 'stock-aging', 'dead-stock', 'inventory-turnover', 'procurement-analytics', 'supplier-performance-reports', 'warehouse-performance', 'stock-variance', 'quality-analytics'), 'mm.dashboard']

@Controller('mm/reports')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ReportsController {
    constructor(private reports: ReportsService) {}

    @Get('stock')
    @MmRead(READERS)
    getStock(@Query() query: ReportsQueryDto) {
        return this.reports.getStock(query)
    }

    @Get('inventory-valuation')
    @MmRead(READERS)
    getInventoryValuation(@Query() query: ReportsQueryDto) {
        return this.reports.getInventoryValuation(query)
    }

    @Get('aging')
    @MmRead(READERS)
    getAging(@Query() query: ReportsQueryDto) {
        return this.reports.getAging(query)
    }

    @Get('dead-stock')
    @MmRead(READERS)
    getDeadStock(@Query() query: ReportsQueryDto) {
        return this.reports.getDeadStock(query)
    }

    @Get('turnover')
    @MmRead(READERS)
    getTurnover(@Query() query: ReportsQueryDto) {
        return this.reports.getTurnover(query)
    }

    @Get('procurement')
    @MmRead(READERS)
    getProcurement(@Query() query: ReportsQueryDto) {
        return this.reports.getProcurement(query)
    }

    @Get('supplier-performance')
    @MmRead(READERS)
    getSupplierPerformance(@Query() query: ReportsQueryDto) {
        return this.reports.getSupplierPerformance(query)
    }

    @Get('warehouse-performance')
    @MmRead(READERS)
    getWarehousePerformance(@Query() query: ReportsQueryDto) {
        return this.reports.getWarehousePerformance(query)
    }

    @Get('stock-variance')
    @MmRead(READERS)
    getStockVariance(@Query() query: ReportsQueryDto) {
        return this.reports.getStockVariance(query)
    }
}
