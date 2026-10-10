import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    Query,
} from '@nestjs/common'
import { MaintenanceService } from './maintenance.service'
import { VehicleDocumentsService } from './vehicle-documents.service'
import type { ListQuery } from '../scm.utils'
import { RequirePermission } from '../../permissions/permission.guard'

@Controller('scm/maintenance')
export class MaintenanceController {
    constructor(
        private readonly maintenanceService: MaintenanceService,
        private readonly vehicleDocumentsService: VehicleDocumentsService,
    ) {}

    @Get()
    @RequirePermission(['scm.maintenance', 'scm.vehicles'], 'read')
    findAll(
        @Query() query: ListQuery & { vehicleId?: string; type?: string },
    ) {
        return this.maintenanceService.findAll(query)
    }

    /** Fleet OR/CR/insurance list (before :id). */
    @Get('documents')
    @RequirePermission(['scm.maintenance', 'scm.vehicles'], 'read')
    findDocuments(
        @Query()
        query: ListQuery & {
            vehicleId?: string
            kind?: string
            expiring?: string
        },
    ) {
        return this.vehicleDocumentsService.findAll(query)
    }

    @Get('compliance-summary')
    @RequirePermission(['scm.maintenance', 'scm.vehicles'], 'read')
    complianceSummary() {
        return this.vehicleDocumentsService.complianceSummary()
    }

    /**
     * Bulk-set Vehicle.maintenanceThresholdKm from Maintenance UI.
     * Empty vehicleIds → all vehicles. null thresholdKm clears.
     */
    @Put('odometer-thresholds')
    @RequirePermission('scm.maintenance', 'update')
    setOdometerThresholds(@Body() body: Record<string, unknown>) {
        return this.maintenanceService.setOdometerThresholds(body as never)
    }

    @Get(':id')
    @RequirePermission(['scm.maintenance', 'scm.vehicles'], 'read')
    findOne(@Param('id') id: string) {
        return this.maintenanceService.findOne(id)
    }

    @Post()
    @RequirePermission('scm.maintenance', 'create')
    create(@Body() body: Record<string, unknown>) {
        return this.maintenanceService.create(body as never)
    }

    @Patch(':id')
    @RequirePermission('scm.maintenance', 'update')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.maintenanceService.update(id, body as never)
    }

    @Delete(':id')
    @RequirePermission('scm.maintenance', 'delete')
    remove(@Param('id') id: string) {
        return this.maintenanceService.remove(id)
    }
}
