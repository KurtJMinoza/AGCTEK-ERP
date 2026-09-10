import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Query,
} from '@nestjs/common'
import { WarehouseTransferOrderService } from './warehouse-transfer-order.service'
import { CreateWarehouseTransferOrderDto } from './dto/create-warehouse-transfer-order.dto'
import { StockOpsQueryDto } from './dto/stock-ops-query.dto'

@Controller('mm/warehouse-transfer-orders')
export class WarehouseTransferOrderController {
    constructor(private service: WarehouseTransferOrderService) {}

    @Post()
    create(@Body() dto: CreateWarehouseTransferOrderDto) {
        return this.service.create(dto)
    }

    @Post(':id/approve')
    approve(@Param('id') id: string, @Body() body: { approvedBy?: string }) {
        return this.service.approve(id, body?.approvedBy)
    }

    @Post(':id/pick')
    pick(@Param('id') id: string) {
        return this.service.pick(id)
    }

    @Post(':id/dispatch')
    dispatch(@Param('id') id: string) {
        return this.service.dispatch(id)
    }

    @Post(':id/receive')
    receive(
        @Param('id') id: string,
        @Body() body: { lineId: string; receivedQty: number },
    ) {
        return this.service.receive(id, body.lineId, body.receivedQty)
    }

    @Post(':id/complete')
    complete(@Param('id') id: string) {
        return this.service.complete(id)
    }

    @Post(':id/cancel')
    cancel(@Param('id') id: string) {
        return this.service.cancel(id)
    }

    @Get()
    findAll(@Query() query: StockOpsQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }
}
