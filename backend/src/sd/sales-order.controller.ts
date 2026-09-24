import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
} from '@nestjs/common'
import {
    ChangeSalesOrderLineQtyDto,
    CreateSalesOrderDto,
    IssueSalesOrderDto,
} from './dto/sales-order.dto'
import { SalesOrderService } from './sales-order.service'
import { SdMmOrchestrationService } from './sd-mm-orchestration.service'

@Controller('sd/sales-orders')
export class SalesOrderController {
    constructor(
        private salesOrders: SalesOrderService,
        private orchestration: SdMmOrchestrationService,
    ) {}

    @Post()
    create(@Body() dto: CreateSalesOrderDto) {
        return this.salesOrders.create(dto)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.salesOrders.findOne(id)
    }

    @Post(':id/confirm')
    confirm(@Param('id') id: string) {
        return this.salesOrders.confirm(id)
    }

    @Post(':id/cancel')
    cancel(@Param('id') id: string) {
        return this.salesOrders.cancel(id)
    }

    @Patch(':id/lines/:lineId/quantity')
    changeQuantity(
        @Param('id') id: string,
        @Param('lineId') lineId: string,
        @Body() dto: ChangeSalesOrderLineQtyDto,
    ) {
        return this.salesOrders.changeQuantity(id, lineId, dto)
    }

    @Post(':id/issue')
    issue(@Param('id') id: string, @Body() dto: IssueSalesOrderDto) {
        return this.orchestration.issueSalesOrder({
            salesOrderId: id,
            storageBinId: dto.storageBinId ?? 'bin-default',
            createdBy: dto.createdBy,
        })
    }
}
