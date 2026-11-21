import { Body, Controller, Get, Param, Put } from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { RequirePermission } from '../../permissions/permission.guard'
import { CrmCustomerRatingService } from './customer-rating.service'
import { SetCustomerRatingDto } from './dto/customer-rating.dto'

@Controller('crm/customers')
export class CrmCustomerRatingController {
    constructor(private readonly ratings: CrmCustomerRatingService) {}

    @Get(':customerId/rating')
    @RequirePermission('crm.customers', 'read')
    get(@Param('customerId') customerId: string) {
        return this.ratings.getForCustomer(customerId)
    }

    @Put(':customerId/rating')
    @RequirePermission('crm.customers', 'update')
    set(
        @Param('customerId') customerId: string,
        @Body() dto: SetCustomerRatingDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.ratings.setRating(customerId, dto, user.id)
    }
}
