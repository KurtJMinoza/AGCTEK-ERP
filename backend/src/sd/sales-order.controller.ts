import {
    Body,
    Controller,
    Get,
    Headers,
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
import { RetailSessionService } from '../retail/retail-session.service'

@Controller('sd/sales-orders')
export class SalesOrderController {
    constructor(
        private salesOrders: SalesOrderService,
        private orchestration: SdMmOrchestrationService,
        private retailSessions: RetailSessionService,
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
    createRetail(
        @Body() dto: CreateRetailSalesOrderDto,
        @Headers('authorization') authorization?: string,
    ) {
        return this.salesOrders.createRetail(
            dto,
            this.retailSessions.clientIdFromAuthorization(authorization),
        )
    }

    /** Mixed-division storefront cart → one ECOMMERCE sales order per division. */
    @Post('retail/checkout')
    createMarketplaceCheckout(
        @Body() dto: CreateMarketplaceCheckoutDto,
        @Headers('authorization') authorization?: string,
    ) {
        return this.salesOrders.createMarketplaceCheckout(
            dto,
            this.retailSessions.clientIdFromAuthorization(authorization),
        )
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
