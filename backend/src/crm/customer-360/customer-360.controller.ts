import { Controller, Get, Param } from '@nestjs/common'
import { RequirePermission } from '../../permissions/permission.guard'
import { CrmCustomer360Service } from './customer-360.service'

@Controller('crm/customers')
export class CrmCustomer360Controller {
    constructor(private readonly customer360: CrmCustomer360Service) {}

    @Get(':customerId/360')
    @RequirePermission('crm.customers', 'read')
    get(@Param('customerId') customerId: string) {
        return this.customer360.get(customerId)
    }
}
