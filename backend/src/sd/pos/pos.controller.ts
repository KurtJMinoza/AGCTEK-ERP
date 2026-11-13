import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
} from '@nestjs/common'
import { RequirePermission } from '../../permissions/permission.guard'
import { PosCheckoutService } from './pos-checkout.service'
import { PosCustomerService } from './pos-customer.service'
import { PosVoidService } from './pos-void.service'
import { PosSessionService } from './pos-session.service'
import { PosHoldService } from './pos-hold.service'
import {
    ClosePosSessionDto,
    HoldPosSaleDto,
    ListPosHoldsQueryDto,
    ListPosSessionsQueryDto,
    OpenPosSessionDto,
    PosCheckoutDto,
    PosCustomerDto,
    PosQuoteDto,
    PosVoidDto,
} from './dto/pos.dto'

/**
 * Retail POS terminal API: cashier shift, tendered checkout and held sales.
 *
 * SD owns the sale and its tenders; MM owns the stock movement the checkout
 * triggers.
 */
@Controller('sd/pos')
export class PosController {
    constructor(
        private readonly checkout: PosCheckoutService,
        private readonly sessions: PosSessionService,
        private readonly holds: PosHoldService,
        private readonly customers: PosCustomerService,
        private readonly voids: PosVoidService,
    ) {}

    /** The POS sales of a branch (transaction history). */
    @Get('orders')
    @RequirePermission(['sd.pos', 'sd.sales-orders'], 'read')
    listOrders(
        @Query('companyId') companyId?: string,
        @Query('branchId') branchId?: string,
        @Query('limit') limit?: string,
    ) {
        return this.checkout.listReceipts({
            companyId: companyId ?? null,
            branchId: branchId ?? null,
            limit: limit ? Number(limit) : undefined,
        })
    }

    /** The receipt of one sale (reprint). */
    @Get('orders/:id/receipt')
    @RequirePermission(['sd.pos', 'sd.sales-orders'], 'read')
    orderReceipt(@Param('id') id: string) {
        return this.checkout.receiptFor(id)
    }

    /** Void a completed sale: the stock returns and the tenders are cancelled. */
    @Post('orders/:id/void')
    @RequirePermission(['sd.pos', 'sd.sales-orders'], 'update')
    voidOrder(
        @Param('id') id: string,
        @Body() dto: PosVoidDto,
    ) {
        return this.voids.voidSale(id, dto)
    }

    /**
     * The Customer Master record of a name typed at the register: the existing
     * customer, or a new one created for a first-time buyer.
     */
    @Post('customers')
    @RequirePermission(['sd.pos', 'sd.customer-master'], 'create')
    createCustomer(@Body() dto: PosCustomerDto) {
        return this.customers.resolveByName(dto.name, dto.createdBy, {
            contactName: dto.contactName,
            email: dto.email,
            phone: dto.phone,
            customerAccountType: dto.customerAccountType,
            creditLimit: dto.creditLimit,
        })
    }

    /** Amount due of a running cart (server prices, discount and tax). */
    @Post('quote')
    @RequirePermission(['sd.pos', 'sd.sales-orders'], 'read')
    quoteCart(@Body() dto: PosQuoteDto) {
        return this.checkout.quote(dto)
    }

    /** Complete a sale: capture the tenders, post the goods issue, receipt. */
    @Post('checkout')
    @RequirePermission(['sd.pos', 'sd.sales-orders'], 'create')
    completeCheckout(@Body() dto: PosCheckoutDto) {
        return this.checkout.complete(dto)
    }

    /** Open the cashier shift of a register. */
    @Post('sessions')
    @RequirePermission(['sd.pos', 'sd.sales-orders'], 'create')
    openSession(@Body() dto: OpenPosSessionDto) {
        return this.sessions.open(dto)
    }

    @Get('sessions')
    @RequirePermission(['sd.pos', 'sd.sales-orders'], 'read')
    listSessions(@Query() query: ListPosSessionsQueryDto) {
        return this.sessions.list(query.companyId, {
            branchId: query.branchId,
            status: query.status,
        })
    }

    /** The shift currently open on a register (or on any register). */
    @Get('sessions/current')
    @RequirePermission(['sd.pos', 'sd.sales-orders'], 'read')
    currentSession(
        @Query('companyId') companyId: string,
        @Query('branchId') branchId?: string,
        @Query('terminalCode') terminalCode?: string,
    ) {
        return this.sessions.current(companyId, branchId, terminalCode)
    }

    /** Money collected during a shift, per tender method. */
    @Get('sessions/:id/collections')
    @RequirePermission(['sd.pos', 'sd.sales-orders'], 'read')
    sessionCollections(@Param('id') id: string) {
        return this.sessions.collections(id)
    }

    /** Close the shift: compare counted cash with the expected cash. */
    @Post('sessions/:id/close')
    @RequirePermission(['sd.pos', 'sd.sales-orders'], 'update')
    closeSession(
        @Param('id') id: string,
        @Body() dto: ClosePosSessionDto,
    ) {
        return this.sessions.close(id, dto)
    }

    /** Park the current cart while another customer is served. */
    @Post('holds')
    @RequirePermission(['sd.pos', 'sd.sales-orders'], 'create')
    hold(@Body() dto: HoldPosSaleDto) {
        return this.holds.hold(dto)
    }

    @Get('holds')
    @RequirePermission(['sd.pos', 'sd.sales-orders'], 'read')
    listHolds(@Query() query: ListPosHoldsQueryDto) {
        return this.holds.list(query.companyId, {
            branchId: query.branchId,
            status: query.status,
        })
    }

    @Post('holds/:id/resume')
    @RequirePermission(['sd.pos', 'sd.sales-orders'], 'update')
    resumeHold(@Param('id') id: string) {
        return this.holds.resume(id)
    }

    @Post('holds/:id/discard')
    @RequirePermission(['sd.pos', 'sd.sales-orders'], 'update')
    discardHold(@Param('id') id: string) {
        return this.holds.discard(id)
    }
}
