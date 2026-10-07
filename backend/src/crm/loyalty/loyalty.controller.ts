import { Controller, Get, Param } from '@nestjs/common'
import { RequirePermission } from '../../permissions/permission.guard'
import { CrmLoyaltyService } from './loyalty.service'

@Controller('crm/customers')
export class CrmLoyaltyController {
    constructor(private readonly loyalty: CrmLoyaltyService) {}

    @Get(':customerId/loyalty')
    @RequirePermission('crm.loyalty', 'read')
    getForCustomer(@Param('customerId') customerId: string) {
        return this.loyalty.getForCustomer(customerId)
    }
}
