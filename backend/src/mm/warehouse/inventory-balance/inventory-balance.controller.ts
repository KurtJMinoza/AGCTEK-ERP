import { Controller, Get, Query } from '@nestjs/common'
import { InventoryBalanceService } from './inventory-balance.service'
import { InventoryBalanceQueryDto } from './dto/inventory-balance-query.dto'

@Controller('mm/inventory-balance')
export class InventoryBalanceController {
    constructor(private readonly service: InventoryBalanceService) {}

    @Get()
    findAll(@Query() query: InventoryBalanceQueryDto) {
        return this.service.query(query)
    }
}
