import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { RequirePermission } from '../../permissions/permission.guard'
import { CarriersService, type CarrierListQuery } from './carriers.service'

@Controller('scm/carriers')
export class CarriersController {
    constructor(private readonly carriers: CarriersService) {}

    @Get()
    @RequirePermission(['scm.couriers', 'scm.consignments'], 'read')
    findAll(@Query() query: CarrierListQuery) {
        return this.carriers.findAll(query)
    }

    @Get(':id')
    @RequirePermission(['scm.couriers', 'scm.consignments'], 'read')
    findOne(@Param('id') id: string) {
        return this.carriers.findOne(id)
    }

    @Post()
    @RequirePermission('scm.couriers', 'create')
    create(@Body() body: Record<string, unknown>) {
        return this.carriers.create(body as never)
    }

    @Patch(':id')
    @RequirePermission('scm.couriers', 'update')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.carriers.update(id, body as never)
    }

    @Delete(':id')
    @RequirePermission('scm.couriers', 'delete')
    remove(@Param('id') id: string) {
        return this.carriers.remove(id)
    }
}
