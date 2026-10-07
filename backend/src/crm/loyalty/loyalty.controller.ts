import { Controller, Get, Param } from '@nestjs/common'
import { RequirePermission } from '../../permissions/permission.guard'
import { MODULE_CODES } from '../../permissions/permissions.constants'
import { CrmLoyaltyService } from './loyalty.service'

@Controller('crm/customers')
export class CrmLoyaltyController {
    constructor(private readonly loyalty: CrmLoyaltyService) {}

    @Get(':customerId/loyalty')
    @RequirePermission(MODULE_CODES.CRM, 'read')
    getForCustomer(@Param('customerId') customerId: string) {
        return this.loyalty.getForCustomer(customerId)
    }
}
