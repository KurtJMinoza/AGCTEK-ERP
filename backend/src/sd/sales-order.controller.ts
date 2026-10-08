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
    CreateMarketplaceCheckoutDto,
    CreateRetailSalesOrderDto,
    CreateSalesOrderDto,
    IssueSalesOrderDto,
    ListSalesOrdersQueryDto,
    UpdateRetailSalesOrderStatusDto,
} from './dto/sales-order.dto'
import { SalesOrderService } from './sales-order.service'
import { SdMmOrchestrationService } from './sd-mm-orchestration.service'
import { RequirePermission } from '../permissions/permission.guard'

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
    @RequirePermission('sd.sales-orders', 'create')
    create(@Body() dto: CreateSalesOrderDto) {
        return this.salesOrders.create(dto)
    }

    @Post('retail')
    @RequirePermission(['sd.pos', 'sd.sales-orders'], 'create')
    createRetail(@Body() dto: CreateRetailSalesOrderDto) {
        return this.salesOrders.createRetail(dto)
    }

    /** Mixed-division storefront cart → one ECOMMERCE sales order per division. */
    @Post('retail/checkout')
    createMarketplaceCheckout(@Body() dto: CreateMarketplaceCheckoutDto) {
        return this.salesOrders.createMarketplaceCheckout(dto)
    }

    @Patch('retail/:id/status')
    @RequirePermission(['sd.sales-orders', 'sd.pos'], 'update')
    updateRetailStatus(
        @Param('id') id: string,
        @Body() dto: UpdateRetailSalesOrderStatusDto,
    ) {
        return this.salesOrders.updateRetailStatus(id, dto)
    }

    @Get(':id')
    @RequirePermission(['sd.sales-orders', 'sd.pos'], 'read')
    findOne(@Param('id') id: string) {
        return this.salesOrders.findOne(id)
    }

    @Post(':id/confirm')
    @RequirePermission('sd.sales-orders', 'update')
    confirm(@Param('id') id: string) {
        return this.salesOrders.confirm(id)
    }

    @Post(':id/cancel')
    @RequirePermission('sd.sales-orders', 'update')
    cancel(@Param('id') id: string) {
        return this.salesOrders.cancel(id)
    }

    @Patch(':id/lines/:lineId/quantity')
    @RequirePermission('sd.sales-orders', 'update')
    changeQuantity(
        @Param('id') id: string,
        @Param('lineId') lineId: string,
        @Body() dto: ChangeSalesOrderLineQtyDto,
    ) {
        return this.salesOrders.changeQuantity(id, lineId, dto)
    }

    @Post(':id/issue')
    @RequirePermission(['sd.sales-orders', 'sd.deliveries'], 'update')
    issue(@Param('id') id: string, @Body() dto: IssueSalesOrderDto) {
        return this.orchestration.issueSalesOrder({
            salesOrderId: id,
            storageBinId: dto.storageBinId ?? 'bin-default',
            createdBy: dto.createdBy,
        })
    }
}
