import { Body, Controller, Param, Post } from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { RequirePermission } from '../../permissions/permission.guard'
import { CrmCustomerRatingsService } from './customer-ratings.service'
import { RateCustomerDto } from './dto/rate-customer.dto'

@Controller('crm/customers')
export class CrmCustomerRatingsController {
    constructor(private readonly ratings: CrmCustomerRatingsService) {}

    @Post(':customerId/ratings')
    @RequirePermission('crm.customers', 'update')
    rate(
        @Param('customerId') customerId: string,
        @Body() dto: RateCustomerDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.ratings.rate(customerId, dto, user.id)
    }
}
