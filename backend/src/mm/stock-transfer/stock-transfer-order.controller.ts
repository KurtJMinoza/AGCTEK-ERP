import { Body, Controller, Get, Param, Post, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { StockTransferOrderService } from './stock-transfer-order.service'
import {
    ApproveStoDto,
    CreateStockTransferOrderDto,
    DispatchStoDto,
    ReceiveStoDto,
    StoQueryDto,
} from './dto/stock-transfer.dto'
import { MmMutation } from '../common/mm-mutation.decorator'

@Controller('mm/stock-transfer-orders')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class StockTransferOrderController {
    constructor(private orders: StockTransferOrderService) {}

    @Post()
    @MmMutation()
    create(@Body() dto: CreateStockTransferOrderDto) {
        return this.orders.create(dto)
    }

    @Get()
    list(@Query() query: StoQueryDto) {
        return this.orders.findAll(query)
    }

    @Get(':id')
    get(@Param('id') id: string) {
        return this.orders.findOne(id)
    }

    @Post(':id/submit')
    @MmMutation()
    submit(@Param('id') id: string) {
        return this.orders.submit(id)
    }

    @Post(':id/approve')
    @MmMutation()
    approve(@Param('id') id: string, @Body() dto: ApproveStoDto) {
        return this.orders.approve(id, dto)
    }

    @Post(':id/allocate')
    @MmMutation()
    allocate(@Param('id') id: string) {
        return this.orders.allocate(id)
    }

    @Post(':id/dispatch')
    @MmMutation()
    dispatch(@Param('id') id: string, @Body() dto: DispatchStoDto) {
        return this.orders.dispatch(id, dto)
    }

    @Post(':id/receive')
    @MmMutation()
    receive(@Param('id') id: string, @Body() dto: ReceiveStoDto) {
        return this.orders.receive(id, dto)
    }

    @Post(':id/cancel')
    @MmMutation()
    cancel(@Param('id') id: string) {
        return this.orders.cancel(id)
    }
}
