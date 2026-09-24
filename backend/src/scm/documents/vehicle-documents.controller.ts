import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common'
import { VehicleDocumentsService } from '../maintenance/vehicle-documents.service'

@Controller('scm/documents')
export class VehicleDocumentsController {
    constructor(
        private readonly vehicleDocumentsService: VehicleDocumentsService,
    ) {}

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.vehicleDocumentsService.findOne(id)
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.vehicleDocumentsService.update(id, body as never)
    }

    /** Soft-cancel (CANCELLED). Prefer over hard delete. */
    @Delete(':id')
    cancel(@Param('id') id: string) {
        return this.vehicleDocumentsService.cancel(id)
    }
}
