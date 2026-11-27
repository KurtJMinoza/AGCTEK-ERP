import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/auth.decorator'
import { RequirePermission } from '../permissions/permission.guard'
import {
    CreateFicoTreasurySettlementDto,
    FicoTaxReconciliationQueryDto,
    FicoTreasuryAccountQueryDto,
    ImportBankStatementDto,
    ResolvePaymentAccountQueryDto,
    UpsertFicoTreasuryAccountDto,
} from './dto/fico-treasury.dto'
import { FicoTaxReconciliationService } from './fico-tax-reconciliation.service'
import { FicoTreasuryAccountService } from './fico-treasury-account.service'
import { FicoTreasuryPaymentResolutionService } from './fico-treasury-payment-resolution.service'
import { FicoTreasurySettlementService } from './fico-treasury-settlement.service'
import { FicoCompanyAccessService } from './fico-company-access.service'

@Controller('fico/treasury')
export class FicoTreasuryController {
    constructor(
        private readonly accounts: FicoTreasuryAccountService,
        private readonly settlements: FicoTreasurySettlementService,
        private readonly paymentResolution: FicoTreasuryPaymentResolutionService,
        private readonly taxReconciliation: FicoTaxReconciliationService,
        private readonly access: FicoCompanyAccessService,
    ) {}

    @Get('accounts')
    @RequirePermission('fico.treasury', 'read')
    listAccounts(
        @Query() query: FicoTreasuryAccountQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accounts.listAccounts(query, user)
    }

    @Post('accounts')
    @RequirePermission('fico.treasury', 'create')
    createAccount(
        @Body() dto: UpsertFicoTreasuryAccountDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accounts.upsertAccount(null, dto, user)
    }

    @Put('accounts/:accountId')
    @RequirePermission('fico.treasury', 'update')
    updateAccount(
        @Param('accountId') accountId: string,
        @Body() dto: UpsertFicoTreasuryAccountDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accounts.upsertAccount(accountId, dto, user)
    }

    @Get('settlements')
    @RequirePermission('fico.treasury', 'read')
    listSettlements(
        @Query('companyId') companyId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.settlements.listSettlements(companyId, user)
    }

    @Post('settlements')
    @RequirePermission('fico.treasury', 'create')
    createSettlement(
        @Body() dto: CreateFicoTreasurySettlementDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.settlements.createSettlement(dto, user)
    }

    @Post('bank-statements/import')
    @RequirePermission('fico.treasury', 'create')
    importBankStatement(
        @Body() dto: ImportBankStatementDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.settlements.importBankStatement(dto, user)
    }

    @Get('bank-statements')
    @RequirePermission('fico.treasury', 'read')
    listBankStatements(
        @Query('companyId') companyId: string,
        @Query('treasuryAccountId') treasuryAccountId: string | undefined,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.settlements.listBankStatement(companyId, treasuryAccountId, user)
    }

    @Get('payment-resolution')
    @RequirePermission('fico.treasury', 'read')
    async resolvePaymentAccount(
        @Query() query: ResolvePaymentAccountQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        await this.access.assertAccess(user, query.companyId)
        return this.paymentResolution.resolvePaymentAccount({
            companyId: query.companyId,
            paymentMethodCode: query.paymentMethodCode,
            currencyCode: query.currencyCode,
            postingDate: new Date(query.postingDate),
            branchId: query.branchId ?? null,
            providerCode: query.providerCode ?? null,
            treasuryAccountId: query.treasuryAccountId ?? null,
            side: query.side ?? 'DEBIT',
        })
    }

    @Get('tax-reconciliation')
    @RequirePermission('fico.treasury', 'read')
    getTaxReconciliation(
        @Query() query: FicoTaxReconciliationQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.taxReconciliation.reconcile(query, user)
    }
}