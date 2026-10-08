import { Controller, Get, Query } from '@nestjs/common'
import { InventoryBalanceService } from './inventory-balance.service'
import { InventoryBalanceQueryDto } from './dto/inventory-balance-query.dto'
import { MmRead } from '../../common/mm-mutation.decorator'
import { MM_REFERENCE_READ } from '../../../permissions/permissions.constants'

@Controller('mm/inventory-balance')
export class InventoryBalanceController {
    constructor(private readonly service: InventoryBalanceService) {}

    @Get()
    @MmRead(MM_REFERENCE_READ)
    findAll(@Query() query: InventoryBalanceQueryDto) {
        return this.service.query(query)
    }
}
