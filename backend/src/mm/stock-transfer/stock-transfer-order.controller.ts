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
import { mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/stock-transfer-orders')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class StockTransferOrderController {
    constructor(private orders: StockTransferOrderService) {}

    @Post()
    @MmMutation(mmFeatures('warehouse-management', 'transfer-orders', 'transfer-queue'))
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
    @MmMutation(mmFeatures('warehouse-management', 'transfer-orders', 'transfer-queue'))
    submit(@Param('id') id: string) {
        return this.orders.submit(id)
    }

    @Post(':id/approve')
    @MmMutation(mmFeatures('warehouse-management', 'transfer-orders', 'transfer-queue'))
    approve(@Param('id') id: string, @Body() dto: ApproveStoDto) {
        return this.orders.approve(id, dto)
    }

    @Post(':id/allocate')
    @MmMutation(mmFeatures('warehouse-management', 'transfer-orders', 'transfer-queue'))
    allocate(@Param('id') id: string) {
        return this.orders.allocate(id)
    }

    @Post(':id/dispatch')
    @MmMutation(mmFeatures('warehouse-management', 'transfer-orders', 'transfer-queue', 'in-transit'))
    dispatch(@Param('id') id: string, @Body() dto: DispatchStoDto) {
        return this.orders.dispatch(id, dto)
    }

    @Post(':id/receive')
    @MmMutation(mmFeatures('warehouse-management', 'transfer-orders', 'in-transit', 'transfer-receipts'))
    receive(@Param('id') id: string, @Body() dto: ReceiveStoDto) {
        return this.orders.receive(id, dto)
    }

    @Post(':id/cancel')
    @MmMutation(mmFeatures('warehouse-management', 'transfer-orders', 'transfer-queue'))
    cancel(@Param('id') id: string) {
        return this.orders.cancel(id)
    }
}
