import { Controller, Get, Query } from '@nestjs/common'
import { ProcurementHistoryService } from './procurement-history.service'
import { ProcurementHistoryQueryDto } from './dto/procurement-history-query.dto'
import { MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('procurement', 'procurement-history')

@Controller('mm/procurement/history')
export class ProcurementHistoryController {
    constructor(private service: ProcurementHistoryService) {}

    @Get()
    @MmRead(READERS)
    search(@Query() query: ProcurementHistoryQueryDto) {
        return this.service.search(query)
    }
}
