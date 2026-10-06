import { Controller, Get, Param } from '@nestjs/common'
import { RequirePermission } from '../../permissions/permission.guard'
import { MODULE_CODES } from '../../permissions/permissions.constants'
import { CrmCustomer360Service } from './customer-360.service'

@Controller('crm/customers')
export class CrmCustomer360Controller {
    constructor(private readonly customer360: CrmCustomer360Service) {}

    @Get(':customerId/360')
    @RequirePermission(MODULE_CODES.CRM, 'read')
    get(@Param('customerId') customerId: string) {
        return this.customer360.get(customerId)
    }
}
