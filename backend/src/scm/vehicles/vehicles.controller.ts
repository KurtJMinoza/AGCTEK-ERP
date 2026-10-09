import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { VehiclesService } from './vehicles.service'
import { VehicleDocumentsService } from '../maintenance/vehicle-documents.service'
import type { ListQuery } from '../scm.utils'
import { SCM_REFERENCE_READ } from '../../permissions/permissions.constants'
import { RequirePermission } from '../../permissions/permission.guard'

@Controller('scm/vehicles')
export class VehiclesController {
    constructor(
        private readonly vehiclesService: VehiclesService,
        private readonly vehicleDocumentsService: VehicleDocumentsService,
    ) {}

    @Get()
    @RequirePermission(SCM_REFERENCE_READ, 'read')
    findAll(@Query() query: ListQuery) {
        return this.vehiclesService.findAll(query)
    }

    @Get(':id/documents')
    @RequirePermission(SCM_REFERENCE_READ, 'read')
    listDocuments(@Param('id') id: string) {
        return this.vehicleDocumentsService.findByVehicle(id)
    }

    @Post(':id/documents')
    @RequirePermission('scm.vehicles', 'update')
    createDocument(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
    ) {
        return this.vehicleDocumentsService.create({
            ...body,
            vehicleId: id,
        } as never)
    }

    @Get(':id/cargo')
    @RequirePermission(SCM_REFERENCE_READ, 'read')
    getCargo(@Param('id') id: string) {
        return this.vehiclesService.getCargo(id)
    }

    @Get(':id')
    @RequirePermission(SCM_REFERENCE_READ, 'read')
    findOne(@Param('id') id: string) {
        return this.vehiclesService.findOne(id)
    }

    @Post()
    @RequirePermission('scm.vehicles', 'create')
    create(@Body() body: Record<string, unknown>) {
        return this.vehiclesService.create(body as never)
    }

    @Patch(':id')
    @RequirePermission('scm.vehicles', 'update')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.vehiclesService.update(id, body as never)
    }

    @Delete(':id')
    @RequirePermission('scm.vehicles', 'delete')
    remove(@Param('id') id: string) {
        return this.vehiclesService.remove(id)
    }
}
