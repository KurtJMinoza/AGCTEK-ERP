import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Body,
    Query,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common'
import { SupplierReturnService } from './supplier-return.service'
import { CustomerReturnService } from './customer-return.service'
import { DamagedExpiredQueryService } from './damaged-expired-query.service'
import { ExpiryControlService } from './expiry-control.service'
import { MmMutation } from '../common/mm-mutation.decorator'
import {
    CreateSupplierReturnDto,
    UpdateSupplierReturnDto,
    ReturnsQueryDto,
    CreateCustomerReturnDto,
    UpdateCustomerReturnDto,
    CustomerReturnQueryDto,
    SetDispositionDto,
    ActionDto,
    CreateFromBalancesDto,
} from './dto/returns-disposal.dto'

@Controller('mm/returns')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ReturnsController {
    constructor(
        private returnService: SupplierReturnService,
        private customerReturnService: CustomerReturnService,
        private damagedExpiredService: DamagedExpiredQueryService,
        private expiryControl: ExpiryControlService,
    ) {}

    // ─── Supplier ───────────────────────────────────────────────

    @Get('supplier')
    listSupplier(@Query() query: ReturnsQueryDto) {
        return this.returnService.findAll(query)
    }

    @MmMutation()
    @Post('supplier')
    createSupplier(@Body() dto: CreateSupplierReturnDto) {
        return this.returnService.create(dto)
    }

    @MmMutation()
    @Post('supplier/from-balances')
    createSupplierFromBalances(@Body() dto: CreateFromBalancesDto) {
        return this.damagedExpiredService.createSupplierReturnFromBalances(dto)
    }

    @Get('supplier/:id')
    getSupplier(@Param('id') id: string) {
        return this.returnService.findOne(id)
    }

    @Patch('supplier/:id')
    updateSupplier(@Param('id') id: string, @Body() dto: UpdateSupplierReturnDto) {
        return this.returnService.update(id, dto)
    }

    @MmMutation()
    @Post('supplier/:id/submit')
    submitSupplier(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.submit(id, dto?.performedBy)
    }

    @MmMutation()
    @Post('supplier/:id/approve')
    approveSupplier(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.approve(id, dto)
    }

    @MmMutation()
    @Post('supplier/:id/reject')
    rejectSupplier(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.reject(id, dto)
    }

    @MmMutation()
    @Post('supplier/:id/post')
    postSupplier(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.post(id, dto)
    }

    @MmMutation()
    @Post('supplier/:id/ship')
    shipSupplier(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.ship(id, dto)
    }

    @MmMutation()
    @Post('supplier/:id/cancel')
    cancelSupplier(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.cancel(id, dto)
    }

    @MmMutation()
    @Post('supplier/:id/reverse')
    reverseSupplier(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.returnService.reverse(id, dto)
    }

    // ─── Customer ───────────────────────────────────────────────

    @Get('customer')
    listCustomer(@Query() query: CustomerReturnQueryDto) {
        return this.customerReturnService.findAll(query)
    }

    @MmMutation()
    @Post('customer')
    createCustomer(@Body() dto: CreateCustomerReturnDto) {
        return this.customerReturnService.create(dto)
    }

    @Get('customer/:id')
    getCustomer(@Param('id') id: string) {
        return this.customerReturnService.findOne(id)
    }

    @Patch('customer/:id')
    updateCustomer(@Param('id') id: string, @Body() dto: UpdateCustomerReturnDto) {
        return this.customerReturnService.update(id, dto)
    }

    @MmMutation()
    @Post('customer/:id/intake')
    intake(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.startIntake(id, dto?.performedBy)
    }

    @MmMutation()
    @Post('customer/:id/inspect')
    inspect(
        @Param('id') id: string,
        @Body()
        dto: ActionDto & { result?: string; lotNotes?: string; decisionNotes?: string },
    ) {
        return this.customerReturnService.inspect(id, dto)
    }

    @MmMutation()
    @Post('customer/:id/disposition')
    disposition(
        @Param('id') id: string,
        @Body()
        dto: {
            lines: Array<{ lineId: string; disposition: string }>
            performedBy?: string
        },
    ) {
        return this.customerReturnService.disposition(id, dto)
    }

    @MmMutation()
    @Post('customer/lines/:lineId/disposition')
    setLineDisposition(@Param('lineId') lineId: string, @Body() dto: SetDispositionDto) {
        return this.customerReturnService.setDisposition(lineId, dto)
    }

    @MmMutation()
    @Post('customer/:id/submit')
    submitCustomer(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.submit(id, dto?.performedBy)
    }

    @MmMutation()
    @Post('customer/:id/approve')
    approveCustomer(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.approve(id, dto)
    }

    @MmMutation()
    @Post('customer/:id/complete')
    completeCustomer(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.customerReturnService.complete(id, dto)
    }

    // ─── Expiry control ─────────────────────────────────────────

    @MmMutation()
    @Post('expiry/block-expired')
    blockExpired(@Body() dto: { companyId: string; performedBy?: string }) {
        return this.expiryControl.blockExpiredStock(dto.companyId, dto.performedBy)
    }
}
