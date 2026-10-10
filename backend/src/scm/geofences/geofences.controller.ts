import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common'
import { GeofencesService } from './geofences.service'
import type { ListQuery } from '../scm.utils'
import { SCM_REFERENCE_READ } from '../../permissions/permissions.constants'
import { RequirePermission } from '../../permissions/permission.guard'

@Controller('scm/geofences')
export class GeofencesController {
    constructor(private readonly geofencesService: GeofencesService) {}

    @Get()
    @RequirePermission(SCM_REFERENCE_READ, 'read')
    findAll(
        @Query() query: ListQuery & { kind?: string; active?: string },
    ) {
        return this.geofencesService.findAll(query)
    }

    @Get('events')
    @RequirePermission(SCM_REFERENCE_READ, 'read')
    listEvents(
        @Query()
        query: ListQuery & { geofenceId?: string; vehicleId?: string },
    ) {
        return this.geofencesService.listEvents(query)
    }

    @Get(':id')
    @RequirePermission(SCM_REFERENCE_READ, 'read')
    findOne(@Param('id') id: string) {
        return this.geofencesService.findOne(id)
    }

    @Post()
    @RequirePermission('scm.tracking', 'create')
    create(@Body() body: Record<string, unknown>) {
        return this.geofencesService.create(body as never)
    }

    @Patch(':id')
    @RequirePermission('scm.tracking', 'update')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.geofencesService.update(id, body as never)
    }

    @Delete(':id')
    @RequirePermission('scm.tracking', 'delete')
    remove(@Param('id') id: string) {
        return this.geofencesService.remove(id)
    }
}
