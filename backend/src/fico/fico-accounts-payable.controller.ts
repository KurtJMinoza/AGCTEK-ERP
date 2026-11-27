import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/auth.decorator'
import { RequirePermission } from '../permissions/permission.guard'
import {
    CreateFicoApAdjustmentDto,
    CreateFicoApClearingDto,
    CreateFicoApDirectInvoiceDto,
    CreateFicoApHistoricalBalanceDto,
    CreateFicoApHistoricalMigrationRunDto,
    CreateFicoApPaymentDto,
    FicoApDashboardQueryDto,
    FicoApClearingQueryDto,
    FicoApCompanyQueryDto,
    FicoApDocumentQueryDto,
    FicoApOpenItemQueryDto,
    FicoApPaymentQueryDto,
    FicoApStatementQueryDto,
    ReverseFicoApDocumentDto,
    SetFicoApPaymentBlockDto,
    UpsertSupplierBankApprovalDto,
    UpsertSupplierCompanyAccountDto,
} from './dto/fico-accounts-payable.dto'
import { FicoAccountsPayableService } from './fico-accounts-payable.service'

@Controller('fico/accounts-payable')
export class FicoAccountsPayableController {
    constructor(private readonly accountsPayable: FicoAccountsPayableService) {}

    @Get('reference-data')
    @RequirePermission('fico.accounts-payable', 'read')
    referenceData(
        @Query('companyId') companyId: string,
        @Query('supplierId') supplierId: string | undefined,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.getReferenceData(companyId, supplierId, user)
    }

    @Get('open-items')
    @RequirePermission('fico.accounts-payable', 'read')
    listOpenItems(
        @Query() query: FicoApOpenItemQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.listOpenItems(query, user)
    }

    @Get('dashboard')
    @RequirePermission('fico.accounts-payable', 'read')
    getDashboard(
        @Query() query: FicoApDashboardQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.getDashboard(query, user)
    }

    @Get('payment-proposals')
    @RequirePermission('fico.accounts-payable', 'read')
    getPaymentProposals(
        @Query('companyId') companyId: string,
        @Query('asOfDate') asOfDate: string | undefined,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.getPaymentProposals(companyId, asOfDate, user)
    }

    @Get('aging')
    @RequirePermission('fico.accounts-payable', 'read')
    getAging(
        @Query('companyId') companyId: string,
        @Query('asOfDate') asOfDate: string | undefined,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.getAging(companyId, asOfDate, user)
    }

    @Get('reconciliation')
    @RequirePermission('fico.accounts-payable', 'read')
    reconcile(
        @Query() query: FicoApCompanyQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.reconcileToGeneralLedger(query.companyId, user)
    }

    @Get('grir-reconciliation')
    @RequirePermission('fico.accounts-payable', 'read')
    grirReconcile(
        @Query() query: FicoApCompanyQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.getGrIrReconciliation(query.companyId, user)
    }

    @Get('documents')
    @RequirePermission('fico.accounts-payable', 'read')
    listDocuments(
        @Query() query: FicoApDocumentQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.listDocuments(query, user)
    }

    @Get('documents/:id')
    @RequirePermission('fico.accounts-payable', 'read')
    getDocument(
        @Param('id') id: string,
        @Query() query: FicoApCompanyQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.getDocument(id, query.companyId, user)
    }

    @Get('payments')
    @RequirePermission('fico.accounts-payable', 'read')
    listPayments(
        @Query() query: FicoApPaymentQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.listPayments(query, user)
    }

    @Get('clearings')
    @RequirePermission('fico.accounts-payable', 'read')
    listClearings(
        @Query() query: FicoApClearingQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.listClearings(query, user)
    }

    @Get('historical-migrations')
    @RequirePermission('fico.accounts-payable', 'read')
    listHistoricalMigrations(
        @Query() query: FicoApCompanyQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.listHistoricalMigrationRuns(query.companyId, user)
    }

    @Post('open-items/:id/payment-block')
    @RequirePermission('fico.accounts-payable', 'update')
    setPaymentBlock(
        @Param('id') id: string,
        @Body() dto: SetFicoApPaymentBlockDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.setOpenItemPaymentBlock(id, dto, user)
    }

    @Get('supplier-statement')
    @RequirePermission('fico.accounts-payable', 'read')
    supplierStatement(
        @Query() query: FicoApStatementQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.getSupplierStatement(query, user)
    }

    @Get('supplier-accounts/:supplierId')
    @RequirePermission('fico.accounts-payable', 'read')
    getSupplierCompanyAccount(
        @Param('supplierId') supplierId: string,
        @Query() query: FicoApCompanyQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.getSupplierCompanyAccount(
            supplierId,
            query.companyId,
            user,
        )
    }

    @Put('supplier-accounts/:supplierId')
    @RequirePermission('fico.accounts-payable', 'update')
    upsertSupplierCompanyAccount(
        @Param('supplierId') supplierId: string,
        @Body() dto: UpsertSupplierCompanyAccountDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.upsertSupplierCompanyAccount(supplierId, dto, user)
    }

    @Put('supplier-accounts/:supplierId/bank-approvals/:bankAccountId')
    @RequirePermission('fico.accounts-payable', 'update')
    upsertSupplierBankApproval(
        @Param('supplierId') supplierId: string,
        @Param('bankAccountId') bankAccountId: string,
        @Body() dto: UpsertSupplierBankApprovalDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.upsertSupplierBankApproval(
            supplierId,
            bankAccountId,
            dto,
            user,
        )
    }

    @Post('payments')
    @RequirePermission('fico.accounts-payable', 'create')
    postPayment(
        @Body() dto: CreateFicoApPaymentDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.postPayment(dto, user)
    }

    @Post('documents')
    @RequirePermission('fico.accounts-payable', 'create')
    postAdjustment(
        @Body() dto: CreateFicoApAdjustmentDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.postAdjustment(dto, user)
    }

    @Post('supplier-invoices')
    @RequirePermission('fico.accounts-payable', 'create')
    postDirectSupplierInvoice(
        @Body() dto: CreateFicoApDirectInvoiceDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.postDirectSupplierInvoice(dto, user)
    }

    @Post('clearings')
    @RequirePermission('fico.accounts-payable', 'create')
    postClearing(
        @Body() dto: CreateFicoApClearingDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.postClearing(dto, user)
    }

    @Post('clearings/:id/reverse')
    @RequirePermission('fico.accounts-payable', 'update')
    reverseClearing(
        @Param('id') id: string,
        @Body() dto: ReverseFicoApDocumentDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.reverseClearing(id, dto, user)
    }

    @Post('historical-migrations')
    @RequirePermission('fico.accounts-payable', 'create')
    createHistoricalMigration(
        @Body() dto: CreateFicoApHistoricalMigrationRunDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.createHistoricalMigrationRun(dto, user)
    }

    @Post('historical-migrations/:id/approve')
    @RequirePermission('fico.accounts-payable', 'update')
    approveHistoricalMigration(
        @Param('id') id: string,
        @Body() dto: FicoApCompanyQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.approveHistoricalMigrationRun(id, dto.companyId, user)
    }

    @Post('historical-migrations/:id/balances')
    @RequirePermission('fico.accounts-payable', 'create')
    migrateHistoricalBalance(
        @Param('id') id: string,
        @Body() dto: CreateFicoApHistoricalBalanceDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.migrateHistoricalBalance(id, dto, user)
    }

    @Post('payments/:id/reverse')
    @RequirePermission('fico.accounts-payable', 'update')
    reversePayment(
        @Param('id') id: string,
        @Body() dto: ReverseFicoApDocumentDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.reversePayment(id, dto, user)
    }

    @Post('documents/:id/reverse')
    @RequirePermission('fico.accounts-payable', 'update')
    reverseDocument(
        @Param('id') id: string,
        @Body() dto: ReverseFicoApDocumentDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsPayable.reverseDocument(id, dto, user)
    }
}
