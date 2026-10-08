import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { DriversService } from './drivers.service'
import type { ListQuery } from '../scm.utils'
import { SCM_REFERENCE_READ } from '../../permissions/permissions.constants'
import { RequirePermission } from '../../permissions/permission.guard'

@Controller('scm/drivers')
export class DriversController {
    constructor(private readonly driversService: DriversService) {}

    @Get()
    @RequirePermission(SCM_REFERENCE_READ, 'read')
    findAll(@Query() query: ListQuery) {
        return this.driversService.findAll(query)
    }

    /** Mobile: resolve Driver for ERP user id (Nest has no JWT yet). */
    @Get('me')
    @RequirePermission(SCM_REFERENCE_READ, 'read')
    me(@Query('userId') userId: string) {
        return this.driversService.findByUserId(userId)
    }

    @Get(':id')
    @RequirePermission(SCM_REFERENCE_READ, 'read')
    findOne(@Param('id') id: string) {
        return this.driversService.findOne(id)
    }

    @Post()
    @RequirePermission('scm.drivers', 'create')
    create(@Body() body: Record<string, unknown>) {
        return this.driversService.create(body as never)
    }

    @Patch(':id')
    @RequirePermission('scm.drivers', 'update')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.driversService.update(id, body as never)
    }

    @Delete(':id')
    @RequirePermission('scm.drivers', 'delete')
    remove(@Param('id') id: string) {
        return this.driversService.remove(id)
    }
}
