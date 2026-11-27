import { Controller, Get, Param, Query } from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/auth.decorator'
import { RequirePermission } from '../permissions/permission.guard'
import {
    FicoArAgingQueryDto,
    FicoArCompanyQueryDto,
    FicoArDocumentQueryDto,
    FicoArOpenItemQueryDto,
} from './dto/fico-accounts-receivable.dto'
import { FicoAccountsReceivableService } from './fico-accounts-receivable.service'

@Controller('fico/accounts-receivable')
export class FicoAccountsReceivableController {
    constructor(private readonly accountsReceivable: FicoAccountsReceivableService) {}

    @Get('open-items')
    @RequirePermission('fico.accounts-receivable', 'read')
    listOpenItems(
        @Query() query: FicoArOpenItemQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsReceivable.listOpenItems(query, user)
    }

    @Get('aging')
    @RequirePermission('fico.accounts-receivable', 'read')
    getAging(
        @Query() query: FicoArAgingQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsReceivable.getAging(query.companyId, query.asOfDate, user)
    }

    @Get('documents')
    @RequirePermission('fico.accounts-receivable', 'read')
    listDocuments(
        @Query() query: FicoArDocumentQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsReceivable.listDocuments(query, user)
    }

    @Get('documents/:id')
    @RequirePermission('fico.accounts-receivable', 'read')
    getDocument(
        @Param('id') id: string,
        @Query() query: FicoArCompanyQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accountsReceivable.getDocument(id, query.companyId, user)
    }
}
