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
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = [...mmFeatures('inventory-management', 'stock-transfers'), ...mmFeatures('warehouse-management', 'warehouse-transfers')]

@Controller('mm/warehouse-transfer-orders')
export class WarehouseTransferOrderController {
    constructor(private service: WarehouseTransferOrderService) {}

    @Post()
    @MmMutation([...mmFeatures('inventory-management', 'stock-transfers'), ...mmFeatures('warehouse-management', 'warehouse-transfers')], 'create')
    create(@Body() dto: CreateWarehouseTransferOrderDto) {
        return this.service.create(dto)
    }

    @Post(':id/approve')
    @MmMutation([...mmFeatures('inventory-management', 'stock-transfers'), ...mmFeatures('warehouse-management', 'warehouse-transfers')], 'update')
    approve(@Param('id') id: string, @Body() body: { approvedBy?: string }) {
        return this.service.approve(id, body?.approvedBy)
    }

    @Post(':id/pick')
    @MmMutation([...mmFeatures('inventory-management', 'stock-transfers'), ...mmFeatures('warehouse-management', 'warehouse-transfers')], 'update')
    pick(@Param('id') id: string) {
        return this.service.pick(id)
    }

    @Post(':id/dispatch')
    @MmMutation([...mmFeatures('inventory-management', 'stock-transfers'), ...mmFeatures('warehouse-management', 'warehouse-transfers')], 'update')
    dispatch(@Param('id') id: string) {
        return this.service.dispatch(id)
    }

    @Post(':id/receive')
    @MmMutation([...mmFeatures('inventory-management', 'stock-transfers'), ...mmFeatures('warehouse-management', 'warehouse-transfers')], 'update')
    receive(
        @Param('id') id: string,
        @Body() body: { lineId: string; receivedQty: number },
    ) {
        return this.service.receive(id, body.lineId, body.receivedQty)
    }

    @Post(':id/complete')
    @MmMutation([...mmFeatures('inventory-management', 'stock-transfers'), ...mmFeatures('warehouse-management', 'warehouse-transfers')], 'update')
    complete(@Param('id') id: string) {
        return this.service.complete(id)
    }

    @Post(':id/cancel')
    @MmMutation([...mmFeatures('inventory-management', 'stock-transfers'), ...mmFeatures('warehouse-management', 'warehouse-transfers')], 'update')
    cancel(@Param('id') id: string) {
        return this.service.cancel(id)
    }

    @Get()
    @MmRead(READERS)
    findAll(@Query() query: StockOpsQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    @MmRead(READERS)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }
}
