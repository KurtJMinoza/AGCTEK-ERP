import {
    UnauthorizedException,
    BadRequestException,
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Patch,
    Post,
    Query,
    Req,
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
import { RetailSessionService } from '../retail/retail-session.service'
import { ReturnRequestService } from './return-request.service'
import {
    CreateCustomerReturnRequestDto,
} from './dto/sales-order.dto'
import type { FastifyRequest } from 'fastify'
import {
    DELIVERY_IMAGE_MAX_BYTES,
    saveDeliveryProofImage,
} from './product-image-storage'

@Controller('sd/sales-orders')
export class SalesOrderController {
    constructor(
        private salesOrders: SalesOrderService,
        private orchestration: SdMmOrchestrationService,
        private retailSessions: RetailSessionService,
        private returnRequests: ReturnRequestService,
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
    @RequirePermission(['sd.sales-orders', 'sd.pos'], 'update')
    updateRetailStatus(
        @Param('id') id: string,
        @Body() dto: UpdateRetailSalesOrderStatusDto,
    ) {
        return this.salesOrders.updateRetailStatus(id, dto)
    }

    /**
     * Storefront return request for a delivered order. The shopper must be
     * signed in and own the order; company scope is resolved server-side.
     */
    @Post('retail/:id/returns')
    requestReturn(
        @Param('id') id: string,
        @Body() dto: CreateCustomerReturnRequestDto,
        @Headers('authorization') authorization?: string,
    ) {
        const clientId = this.retailSessions.clientIdFromAuthorization(
            authorization,
        )
        if (!clientId) {
            throw new UnauthorizedException(
                'Please sign in to request a return',
            )
        }
        return this.returnRequests.createForCustomer(clientId, id, dto)
    }

    /** Multipart POD upload (field `file`); returns `{ imageUrl }` to attach to an order. */
    @Post('delivery-proof-image')
    @RequirePermission(['sd.sales-orders', 'sd.pos'], 'update')
    async uploadDeliveryProof(@Req() req: FastifyRequest) {
        let buffer: Buffer | null = null
        for await (const part of req.parts({
            limits: { fileSize: DELIVERY_IMAGE_MAX_BYTES, files: 1 },
        })) {
            if (part.type === 'file' && !buffer) buffer = await part.toBuffer()
        }
        if (!buffer || buffer.length === 0) {
            throw new BadRequestException(
                'Proof-of-delivery image is required',
            )
        }
        return { imageUrl: saveDeliveryProofImage(buffer) }
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
