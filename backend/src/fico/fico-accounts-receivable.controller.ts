import { Body, Controller, Get, Post, Put, Param, Query } from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/auth.decorator'
import { RequirePermission } from '../permissions/permission.guard'
import {
    CreateFicoArAdjustmentDto,
    CreateFicoArCollectionDto,
    FicoArCompanyQueryDto,
    FicoArDashboardQueryDto,
    FicoArOpenItemQueryDto,
    UpsertCustomerCompanyAccountDto,
} from './dto/fico-accounts-receivable.dto'
import { FicoAccountsReceivableService } from './fico-accounts-receivable.service'

@Controller('fico/accounts-receivable')
export class FicoAccountsReceivableController {
    constructor(private readonly accountsReceivable: FicoAccountsReceivableService) {}

    @Get('dashboard')
    @RequirePermission('fico.accounts-receivable', 'read')
    getDashboard(
        @Query() query: FicoArDashboardQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsReceivable.getDashboard(query, user)
    }

    @Get('open-items')
    @RequirePermission('fico.accounts-receivable', 'read')
    listOpenItems(
        @Query() query: FicoArOpenItemQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsReceivable.listOpenItems(query, user)
    }

    @Get('reconciliation')
    @RequirePermission('fico.accounts-receivable', 'read')
    reconcile(
        @Query() query: FicoArCompanyQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsReceivable.reconcileToGeneralLedger(query.companyId, user)
    }

    @Post('collections')
    @RequirePermission('fico.accounts-receivable', 'create')
    postCollection(
        @Body() dto: CreateFicoArCollectionDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsReceivable.postCollection(dto, user)
    }

    @Post('documents')
    @RequirePermission('fico.accounts-receivable', 'create')
    postAdjustment(
        @Body() dto: CreateFicoArAdjustmentDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsReceivable.postAdjustment(dto, user)
    }

    @Put('customer-accounts/:customerId')
    @RequirePermission('fico.accounts-receivable', 'update')
    upsertCustomerCompanyAccount(
        @Param('customerId') customerId: string,
        @Body() dto: UpsertCustomerCompanyAccountDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsReceivable.upsertCustomerCompanyAccount(customerId, dto, user)
    }
}