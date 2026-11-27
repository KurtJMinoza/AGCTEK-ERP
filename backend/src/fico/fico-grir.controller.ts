import { Controller, Get, Post, Query } from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/auth.decorator'
import { RequirePermission } from '../permissions/permission.guard'
import { FicoGrIrOpenItemService } from './fico-grir-open-item.service'
import { FicoGrIrWorkbenchService } from './fico-grir-workbench.service'
import { FicoApCompanyQueryDto } from './dto/fico-accounts-payable.dto'
import { FicoGrIrWorkbenchQueryDto } from './dto/fico-grir.dto'

@Controller('fico/grir')
export class FicoGrIrController {
    constructor(
        private readonly workbench: FicoGrIrWorkbenchService,
        private readonly openItems: FicoGrIrOpenItemService,
    ) {}

    @Get('workbench')
    @RequirePermission('fico.accounts-payable', 'read')
    getWorkbench(
        @Query() query: FicoGrIrWorkbenchQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.workbench.getWorkbench(query, user)
    }

    @Post('backfill')
    @RequirePermission('fico.accounts-payable', 'update')
    backfill(
        @Query() query: FicoApCompanyQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.openItems.backfillCompany(query.companyId).then((count) => ({
            companyId: query.companyId,
            linesUpserted: count,
        }))
    }
}