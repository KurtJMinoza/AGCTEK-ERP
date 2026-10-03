import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common'
import {
    ChangeSalesOrderLineQtyDto,
    CreateRetailSalesOrderDto,
    CreateSalesOrderDto,
    IssueSalesOrderDto,
    ListSalesOrdersQueryDto,
    UpdateRetailSalesOrderStatusDto,
} from './dto/sales-order.dto'
import { SalesOrderService } from './sales-order.service'
import { SdMmOrchestrationService } from './sd-mm-orchestration.service'

@Controller('sd/sales-orders')
export class SalesOrderController {
    constructor(
        private salesOrders: SalesOrderService,
        private orchestration: SdMmOrchestrationService,
    ) {}

    @Get()
    list(@Query() query: ListSalesOrdersQueryDto) {
        return this.salesOrders.list(query)
    }

    @Post()
    create(@Body() dto: CreateSalesOrderDto) {
        return this.salesOrders.create(dto)
    }

    @Post('retail')
    createRetail(@Body() dto: CreateRetailSalesOrderDto) {
        return this.salesOrders.createRetail(dto)
    }

    @Patch('retail/:id/status')
    updateRetailStatus(
        @Param('id') id: string,
        @Body() dto: UpdateRetailSalesOrderStatusDto,
    ) {
        return this.salesOrders.updateRetailStatus(id, dto)
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
