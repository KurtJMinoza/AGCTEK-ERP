import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Body,
    Query,
} from '@nestjs/common'
import { ReturnsDisposalConfigService } from './returns-disposal-config.service'
import { SupplierReturnService } from './supplier-return.service'
import { DisposalService } from './disposal.service'
import { CustomerReturnService } from './customer-return.service'
import { DamagedExpiredQueryService } from './damaged-expired-query.service'
import {
    UpsertConfigDto,
    CreateSupplierReturnDto,
    UpdateSupplierReturnDto,
    ReturnsQueryDto,
    CreateDisposalDto,
    UpdateDisposalDto,
    DisposalQueryDto,
    DamagedExpiredQueryDto,
    ActionDto,
    CreateCustomerReturnDto,
    UpdateCustomerReturnDto,
    CustomerReturnQueryDto,
    SetDispositionDto,
    IdentifyDamageDto,
    MarkExpiredDto,
    CreateFromBalancesDto,
} from './dto/returns-disposal.dto'

@Controller('mm/returns-disposal')
export class ReturnsDisposalController {
    constructor(
        private configService: ReturnsDisposalConfigService,
        private returnService: SupplierReturnService,
        private disposalService: DisposalService,
        private customerReturnService: CustomerReturnService,
        private damagedExpiredService: DamagedExpiredQueryService,
    ) {}

    // ─── Config ─────────────────────────────────────────────────

    @Get('config')
    getConfig(@Query('companyId') companyId: string) {
        return this.configService.get(companyId)
    }

    @Patch('config')
    upsertConfig(@Body() dto: UpsertConfigDto) {
        return this.configService.upsert(dto)
    }

    // ─── Supplier Returns ───────────────────────────────────────

    @Get('supplier-returns')
    listReturns(@Query() query: ReturnsQueryDto) {
        return this.returnService.findAll(query)
    }

    @Post('supplier-returns')
    createReturn(@Body() dto: CreateSupplierReturnDto) {
        return this.returnService.create(dto)
    }

    @Post('supplier-returns/from-balances')
    createReturnFromBalances(@Body() dto: CreateFromBalancesDto) {
        return this.damagedExpiredService.createSupplierReturnFromBalances(dto)
    }

    @Get('supplier-returns/:id')
    getReturn(@Param('id') id: string) {
        return this.returnService.findOne(id)
    }

    @Patch('supplier-returns/:id')
    updateReturn(@Param('id') id: string, @Body() dto: UpdateSupplierReturnDto) {
        return this.returnService.update(id, dto)
    }

    @Post('supplier-returns/:id/submit')
    submitReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.submit(id, dto?.performedBy)
    }

    @Post('supplier-returns/:id/approve')
    approveReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.approve(id, dto)
    }

    @Post('supplier-returns/:id/reject')
    rejectReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.reject(id, dto)
    }

    @Post('supplier-returns/:id/ship')
    shipReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.ship(id, dto)
    }

    @Post('supplier-returns/:id/cancel')
    cancelReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.cancel(id, dto)
    }

    @Post('supplier-returns/:id/reverse')
    reverseReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.reverse(id, dto)
    }

    // ─── Customer Returns ───────────────────────────────────────

    @Get('customer-returns')
    listCustomerReturns(@Query() query: CustomerReturnQueryDto) {
        return this.customerReturnService.findAll(query)
    }

    @Post('customer-returns')
    createCustomerReturn(@Body() dto: CreateCustomerReturnDto) {
        return this.customerReturnService.create(dto)
    }

    @Get('customer-returns/:id')
    getCustomerReturn(@Param('id') id: string) {
        return this.customerReturnService.findOne(id)
    }

    @Patch('customer-returns/:id')
    updateCustomerReturn(
        @Param('id') id: string,
        @Body() dto: UpdateCustomerReturnDto,
    ) {
        return this.customerReturnService.update(id, dto)
    }

    @Post('customer-returns/:id/intake')
    startIntake(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.startIntake(id, dto?.performedBy)
    }

    @Post('customer-returns/:id/inspection')
    startInspection(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.startInspection(id, dto?.performedBy)
    }

    @Post('customer-returns/lines/:lineId/disposition')
    setDisposition(@Param('lineId') lineId: string, @Body() dto: SetDispositionDto) {
        return this.customerReturnService.setDisposition(lineId, dto)
    }

    @Post('customer-returns/:id/submit')
    submitCustomerReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.submit(id, dto?.performedBy)
    }

    @Post('customer-returns/:id/approve')
    approveCustomerReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.approve(id, dto)
    }

    @Post('customer-returns/:id/reject')
    rejectCustomerReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.reject(id, dto)
    }

    @Post('customer-returns/:id/complete')
    completeCustomerReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.complete(id, dto)
    }

    @Post('customer-returns/:id/cancel')
    cancelCustomerReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.cancel(id, dto)
    }

    @Post('customer-returns/:id/reverse')
    reverseCustomerReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.reverse(id, dto)
    }

    // ─── Disposals ──────────────────────────────────────────────

    @Get('disposals')
    listDisposals(@Query() query: DisposalQueryDto) {
        return this.disposalService.findAll(query)
    }

    @Post('disposals')
    createDisposal(@Body() dto: CreateDisposalDto) {
        return this.disposalService.create(dto)
    }

    @Post('disposals/from-balances')
    createDisposalFromBalances(@Body() dto: CreateFromBalancesDto) {
        return this.damagedExpiredService.createDisposalFromBalances(dto)
    }

    @Get('disposals/:id')
    getDisposal(@Param('id') id: string) {
        return this.disposalService.findOne(id)
    }

    @Patch('disposals/:id')
    updateDisposal(@Param('id') id: string, @Body() dto: UpdateDisposalDto) {
        return this.disposalService.update(id, dto)
    }

    @Post('disposals/:id/submit')
    submitDisposal(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.submit(id, dto?.performedBy)
    }

    @Post('disposals/:id/approve')
    approveDisposal(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.approve(id, dto)
    }

    @Post('disposals/:id/reject')
    rejectDisposal(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.reject(id, dto)
    }

    @Post('disposals/:id/post')
    postDisposal(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.post(id, dto)
    }

    @Post('disposals/:id/cancel')
    cancelDisposal(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.cancel(id, dto)
    }

    @Post('disposals/:id/reverse')
    reverseDisposal(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.reverse(id, dto)
    }

    // ─── Worklists ──────────────────────────────────────────────

    @Get('damaged-stock')
    damagedStock(@Query() query: DamagedExpiredQueryDto) {
        return this.damagedExpiredService.getDamagedStock(query)
    }

    @Get('expired-stock')
    expiredStock(@Query() query: DamagedExpiredQueryDto) {
        return this.damagedExpiredService.getExpiredStock(query)
    }

    @Post('damaged-stock/identify')
    identifyDamage(@Body() dto: IdentifyDamageDto) {
        return this.damagedExpiredService.identifyDamage(dto)
    }

    @Post('expired-stock/mark')
    markExpired(@Body() dto: MarkExpiredDto) {
        return this.damagedExpiredService.markExpired(dto)
    }
}
