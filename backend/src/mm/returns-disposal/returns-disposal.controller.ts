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
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'
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

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('returns-disposal', 'customer-return-intake', 'damaged-stock', 'disposal', 'expired-stock', 'scrap', 'supplier-returns')

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
    @MmRead(READERS)
    getConfig(@Query('companyId') companyId: string) {
        return this.configService.get(companyId)
    }

    @Patch('config')
    @MmMutation(mmFeatures('returns-disposal', 'supplier-returns', 'customer-return-intake', 'damaged-stock', 'expired-stock', 'scrap', 'disposal'), 'update')
    upsertConfig(@Body() dto: UpsertConfigDto) {
        return this.configService.upsert(dto)
    }

    // ─── Supplier Returns ───────────────────────────────────────

    @Get('supplier-returns')
    @MmRead(READERS)
    listReturns(@Query() query: ReturnsQueryDto) {
        return this.returnService.findAll(query)
    }

    @MmMutation(mmFeatures('returns-disposal', 'supplier-returns'))
    @Post('supplier-returns')
    createReturn(@Body() dto: CreateSupplierReturnDto) {
        return this.returnService.create(dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'supplier-returns'))
    @Post('supplier-returns/from-balances')
    createReturnFromBalances(@Body() dto: CreateFromBalancesDto) {
        return this.damagedExpiredService.createSupplierReturnFromBalances(dto)
    }

    @Get('supplier-returns/:id')
    @MmRead(READERS)
    getReturn(@Param('id') id: string) {
        return this.returnService.findOne(id)
    }

    @Patch('supplier-returns/:id')
    @MmMutation(mmFeatures('returns-disposal', 'supplier-returns'), 'update')
    updateReturn(@Param('id') id: string, @Body() dto: UpdateSupplierReturnDto) {
        return this.returnService.update(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'supplier-returns'))
    @Post('supplier-returns/:id/submit')
    submitReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.submit(id, dto?.performedBy)
    }

    @MmMutation(mmFeatures('returns-disposal', 'supplier-returns'))
    @Post('supplier-returns/:id/approve')
    approveReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.approve(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'supplier-returns'))
    @Post('supplier-returns/:id/reject')
    rejectReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.reject(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'supplier-returns'))
    @Post('supplier-returns/:id/ship')
    shipReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.ship(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'supplier-returns'))
    @Post('supplier-returns/:id/post')
    postReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.post(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'supplier-returns'))
    @Post('supplier-returns/:id/cancel')
    cancelReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.cancel(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'supplier-returns'))
    @Post('supplier-returns/:id/reverse')
    reverseReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.reverse(id, dto)
    }

    // ─── Customer Returns ───────────────────────────────────────

    @Get('customer-returns')
    @MmRead(READERS)
    listCustomerReturns(@Query() query: CustomerReturnQueryDto) {
        return this.customerReturnService.findAll(query)
    }

    @MmMutation(mmFeatures('returns-disposal', 'customer-return-intake'))
    @Post('customer-returns')
    createCustomerReturn(@Body() dto: CreateCustomerReturnDto) {
        return this.customerReturnService.create(dto)
    }

    @Get('customer-returns/:id')
    @MmRead(READERS)
    getCustomerReturn(@Param('id') id: string) {
        return this.customerReturnService.findOne(id)
    }

    @Patch('customer-returns/:id')
    @MmMutation(mmFeatures('returns-disposal', 'customer-return-intake'), 'update')
    updateCustomerReturn(
        @Param('id') id: string,
        @Body() dto: UpdateCustomerReturnDto,
    ) {
        return this.customerReturnService.update(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'customer-return-intake'))
    @Post('customer-returns/:id/intake')
    startIntake(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.startIntake(id, dto?.performedBy)
    }

    @MmMutation(mmFeatures('returns-disposal', 'customer-return-intake'))
    @Post('customer-returns/:id/inspection')
    startInspection(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.startInspection(id, dto?.performedBy)
    }

    @MmMutation(mmFeatures('returns-disposal', 'customer-return-intake'))
    @Post('customer-returns/lines/:lineId/disposition')
    setDisposition(@Param('lineId') lineId: string, @Body() dto: SetDispositionDto) {
        return this.customerReturnService.setDisposition(lineId, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'customer-return-intake'))
    @Post('customer-returns/:id/submit')
    submitCustomerReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.submit(id, dto?.performedBy)
    }

    @MmMutation(mmFeatures('returns-disposal', 'customer-return-intake'))
    @Post('customer-returns/:id/approve')
    approveCustomerReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.approve(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'customer-return-intake'))
    @Post('customer-returns/:id/reject')
    rejectCustomerReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.reject(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'customer-return-intake'))
    @Post('customer-returns/:id/complete')
    completeCustomerReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.complete(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'customer-return-intake'))
    @Post('customer-returns/:id/cancel')
    cancelCustomerReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.cancel(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'customer-return-intake'))
    @Post('customer-returns/:id/reverse')
    reverseCustomerReturn(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.reverse(id, dto)
    }

    // ─── Disposals ──────────────────────────────────────────────

    @Get('disposals')
    @MmRead(READERS)
    listDisposals(@Query() query: DisposalQueryDto) {
        return this.disposalService.findAll(query)
    }

    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'))
    @Post('disposals')
    createDisposal(@Body() dto: CreateDisposalDto) {
        return this.disposalService.create(dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'))
    @Post('disposals/from-balances')
    createDisposalFromBalances(@Body() dto: CreateFromBalancesDto) {
        return this.damagedExpiredService.createDisposalFromBalances(dto)
    }

    @Get('disposals/:id')
    @MmRead(READERS)
    getDisposal(@Param('id') id: string) {
        return this.disposalService.findOne(id)
    }

    @Patch('disposals/:id')
    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'), 'update')
    updateDisposal(@Param('id') id: string, @Body() dto: UpdateDisposalDto) {
        return this.disposalService.update(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'))
    @Post('disposals/:id/submit')
    submitDisposal(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.submit(id, dto?.performedBy)
    }

    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'))
    @Post('disposals/:id/approve')
    approveDisposal(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.approve(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'))
    @Post('disposals/:id/reject')
    rejectDisposal(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.reject(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'))
    @Post('disposals/:id/post')
    postDisposal(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.post(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'))
    @Post('disposals/:id/cancel')
    cancelDisposal(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.cancel(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'))
    @Post('disposals/:id/reverse')
    reverseDisposal(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.reverse(id, dto)
    }

    // ─── Worklists ──────────────────────────────────────────────

    @Get('damaged-stock')
    @MmRead(READERS)
    damagedStock(@Query() query: DamagedExpiredQueryDto) {
        return this.damagedExpiredService.getDamagedStock(query)
    }

    @Get('expired-stock')
    @MmRead(READERS)
    expiredStock(@Query() query: DamagedExpiredQueryDto) {
        return this.damagedExpiredService.getExpiredStock(query)
    }

    @MmMutation(mmFeatures('returns-disposal', 'damaged-stock'))
    @Post('damaged-stock/identify')
    identifyDamage(@Body() dto: IdentifyDamageDto) {
        return this.damagedExpiredService.identifyDamage(dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'expired-stock'))
    @Post('expired-stock/mark')
    markExpired(@Body() dto: MarkExpiredDto) {
        return this.damagedExpiredService.markExpired(dto)
    }
}
