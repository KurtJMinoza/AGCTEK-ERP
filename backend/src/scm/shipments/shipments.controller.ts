import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ShipmentsService } from './shipments.service'
import type { ListQuery } from '../scm.utils'
import { RequirePermission } from '../../permissions/permission.guard'

@Controller('scm/shipments')
export class ShipmentsController {
    constructor(private readonly shipmentsService: ShipmentsService) {}

    @Get()
    @RequirePermission(['scm.shipments', 'scm.load-building', 'scm.trip-planning'], 'read')
    findAll(@Query() query: ListQuery) {
        return this.shipmentsService.findAll(query)
    }

    @Post('from-package/:packageId')
    @RequirePermission('scm.shipments', 'create')
    createFromPackage(@Param('packageId') packageId: string) {
        return this.shipmentsService.createFromPackage(packageId)
    }

    @Get(':id')
    @RequirePermission(['scm.shipments', 'scm.load-building', 'scm.trip-planning'], 'read')
    findOne(@Param('id') id: string) {
        return this.shipmentsService.findOne(id)
    }

    @Post()
    @RequirePermission('scm.shipments', 'create')
    create(@Body() body: Record<string, unknown>) {
        return this.shipmentsService.create(body as never)
    }

    @Patch(':id')
    @RequirePermission('scm.shipments', 'update')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.shipmentsService.update(id, body as never)
    }

    @Delete(':id')
    @RequirePermission('scm.shipments', 'delete')
    remove(@Param('id') id: string) {
        return this.shipmentsService.remove(id)
    }
}
