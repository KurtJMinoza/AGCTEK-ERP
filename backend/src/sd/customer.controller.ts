import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import {
    CreateCustomerDto,
    ListCustomersQueryDto,
    UpdateCustomerDto,
} from './dto/customer.dto'
import { CustomerService } from './customer.service'

@Controller('sd/customers')
export class CustomerController {
    constructor(private customers: CustomerService) {}

    @Get()
    list(@Query() query: ListCustomersQueryDto) {
        return this.customers.list(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.customers.findOne(id)
    }

    @Post()
    create(@Body() dto: CreateCustomerDto) {
        return this.customers.create(dto)
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
        return this.customers.update(id, dto)
    }
}
