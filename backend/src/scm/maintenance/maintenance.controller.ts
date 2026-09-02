import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { MaintenanceService } from './maintenance.service'
import type { ListQuery } from '../scm.utils'

@Controller('scm/maintenance')
export class MaintenanceController {
    constructor(private readonly maintenanceService: MaintenanceService) {}

    @Get()
    findAll(@Query() query: ListQuery & { vehicleId?: string }) {
        return this.maintenanceService.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.maintenanceService.findOne(id)
    }

    @Post()
    create(@Body() body: Record<string, unknown>) {
        return this.maintenanceService.create(body as never)
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.maintenanceService.update(id, body as never)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.maintenanceService.remove(id)
    }
}
