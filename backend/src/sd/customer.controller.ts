import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import {
    CreateCustomerDto,
    ListCustomersQueryDto,
    UpdateCustomerDto,
} from './dto/customer.dto'
import { CustomerService } from './customer.service'
import { RequirePermission } from '../permissions/permission.guard'

@Controller('sd/customers')
export class CustomerController {
    constructor(private customers: CustomerService) {}

    @Get()
    @RequirePermission(['sd.customer-master', 'crm'], 'read')
    list(@Query() query: ListCustomersQueryDto) {
        return this.customers.list(query)
    }

    @Get(':id')
    @RequirePermission(['sd.customer-master', 'crm'], 'read')
    findOne(@Param('id') id: string) {
        return this.customers.findOne(id)
    }

    @Post()
    @RequirePermission('sd.customer-master', 'create')
    create(@Body() dto: CreateCustomerDto) {
        return this.customers.create(dto)
    }

    @Patch(':id')
    @RequirePermission('sd.customer-master', 'update')
    update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
        return this.customers.update(id, dto)
    }
}
