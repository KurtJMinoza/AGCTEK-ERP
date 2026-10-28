import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { RequirePermission } from '../../permissions/permission.guard'
import { MockEarnDto } from './dto/mock-earn.dto'
import { CrmLoyaltyService } from './loyalty.service'

@Controller('crm/customers')
export class CrmLoyaltyController {
    constructor(private readonly loyalty: CrmLoyaltyService) {}

    @Get(':customerId/loyalty')
    @RequirePermission('crm.loyalty', 'read')
    getForCustomer(@Param('customerId') customerId: string) {
        return this.loyalty.getForCustomer(customerId)
    }

    /** Demo / staging only (LOYALTY_MOCK_ACCRUAL=true and not production, else 403); not invoice-backed. */
    @Post(':customerId/loyalty/mock-earn')
    @RequirePermission('crm.loyalty', 'update')
    mockEarn(
        @Param('customerId') customerId: string,
        @Body() dto: MockEarnDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.loyalty.mockEarn(customerId, dto, user.id)
    }
}
