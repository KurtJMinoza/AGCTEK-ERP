import { Controller, Get, Query } from '@nestjs/common'
import { ProcurementHistoryService } from './procurement-history.service'
import { ProcurementHistoryQueryDto } from './dto/procurement-history-query.dto'

@Controller('mm/procurement/history')
export class ProcurementHistoryController {
    constructor(private service: ProcurementHistoryService) {}

    @Get()
    search(@Query() query: ProcurementHistoryQueryDto) {
        return this.service.search(query)
    }
}
