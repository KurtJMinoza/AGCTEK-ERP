import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../auth/auth.decorator'
import { RequirePermission } from '../permissions/permission.guard'
import { ExtPlatformTransactionService } from './ext-platform-transaction.service'
import { SdExtPlatformFinanceService } from './sd-ext-platform-finance.service'
import {
    CreateExtPlatformTransactionDto,
    CreateSalesSourceDto,
    ExtPlatformStockQueryDto,
    ListExtPlatformTransactionsQueryDto,
    PreviewExtPlatformTransactionDto,
    UpdateExtPlatformTransactionDto,
    UpdateExtPlatformTransactionStatusDto,
    UpdateSalesSourceDto,
    VoidExtPlatformTransactionDto,
} from './dto/ext-platform-transaction.dto'

@Controller('sd/ext-platform')
export class ExtPlatformTransactionController {
    constructor(
        private readonly service: ExtPlatformTransactionService,
        private readonly finance: SdExtPlatformFinanceService,
    ) {}

    // ── Sales Sources ────────────────────────────────────────────

    @Get('sources')
    @RequirePermission('sd.ext-platform-sales', 'read')
    listSources() {
        return this.service.listSalesSources()
    }

    @Post('sources')
    @RequirePermission('sd.ext-platform-sales', 'create')
    createSource(@Body() dto: CreateSalesSourceDto) {
        return this.service.createSalesSource(dto)
    }

    @Patch('sources/:id')
    @RequirePermission('sd.ext-platform-sales', 'update')
    updateSource(@Param('id') id: string, @Body() dto: UpdateSalesSourceDto) {
        return this.service.updateSalesSource(id, dto)
    }

    @Delete('sources/:id')
    @RequirePermission('sd.ext-platform-sales', 'delete')
    deleteSource(@Param('id') id: string) {
        return this.service.deleteSalesSource(id)
    }

    // ── Transactions ─────────────────────────────────────────────

    @Get('transactions')
    @RequirePermission('sd.ext-platform-sales', 'read')
    list(@Query() query: ListExtPlatformTransactionsQueryDto) {
        return this.service.list(query)
    }

    @Get('transactions/report-summary')
    @RequirePermission('sd.ext-platform-sales', 'read')
    reportSummary(@Query() query: ListExtPlatformTransactionsQueryDto) {
        return this.service.reportSummary(query)
    }

    @Post('stock')
    @RequirePermission('sd.ext-platform-sales', 'create')
    stock(@Body() dto: ExtPlatformStockQueryDto) {
        return this.service.stockFor(dto.items)
    }

    @Post('transactions/preview')
    @RequirePermission('sd.ext-platform-sales', 'create')
    preview(@Body() dto: PreviewExtPlatformTransactionDto) {
        return this.service.preview(dto)
    }

    @Get('transactions/:id')
    @RequirePermission('sd.ext-platform-sales', 'read')
    findById(@Param('id') id: string) {
        return this.service.findById(id)
    }

    @Get('transactions/:id/accounting')
    @RequirePermission(['sd.ext-platform-sales', 'fico.journal-entries'], 'read')
    accountingSnapshot(
        @Param('id') id: string,
        @Query('companyId') companyId?: string,
    ) {
        return this.finance.getAccountingForTransaction(id, companyId)
    }

    @Post('transactions')
    @RequirePermission('sd.ext-platform-sales', 'create')
    create(
        @Body() dto: CreateExtPlatformTransactionDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.service.create(dto, user?.id)
    }

    @Patch('transactions/:id')
    @RequirePermission('sd.ext-platform-sales', 'update')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateExtPlatformTransactionDto,
    ) {
        return this.service.update(id, dto)
    }

    @Patch('transactions/:id/status')
    @RequirePermission('sd.ext-platform-sales', 'update')
    updateStatus(
        @Param('id') id: string,
        @Body() dto: UpdateExtPlatformTransactionStatusDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.service.updateStatus(id, dto, user?.id ?? user?.userName)
    }

    /** Voids a confirmed / approved sale with a required reason; an approved company-owned sale returns its stock. */
    @Post('transactions/:id/void')
    @RequirePermission('sd.ext-platform-sales', 'update')
    void(
        @Param('id') id: string,
        @Body() dto: VoidExtPlatformTransactionDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.service.voidTransaction(id, dto, user?.id ?? user?.userName)
    }

    @Delete('transactions/:id')
    @RequirePermission('sd.ext-platform-sales', 'delete')
    remove(@Param('id') id: string) {
        return this.service.delete(id)
    }
}
