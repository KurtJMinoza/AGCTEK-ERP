import { Controller, Get, Query } from '@nestjs/common'
import { RequirePermission } from '../permissions/permission.guard'
import { ListBackordersQueryDto } from './dto/backorder.dto'
import { BackorderReportService } from './backorder-report.service'

/** Read-only backorder report: open sales order quantities not yet covered by MM. */
@Controller('sd/backorders')
export class BackorderReportController {
    constructor(private readonly backorders: BackorderReportService) {}

    @Get()
    @RequirePermission('sd.reports', 'read')
    list(@Query() query: ListBackordersQueryDto) {
        return this.backorders.list(query)
    }
}
