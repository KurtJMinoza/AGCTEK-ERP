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

@Controller('scm/geofences')
export class GeofencesController {
    constructor(private readonly geofencesService: GeofencesService) {}

    @Get()
    findAll(
        @Query() query: ListQuery & { kind?: string; active?: string },
    ) {
        return this.geofencesService.findAll(query)
    }

    @Get('events')
    listEvents(
        @Query()
        query: ListQuery & { geofenceId?: string; vehicleId?: string },
    ) {
        return this.geofencesService.listEvents(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.geofencesService.findOne(id)
    }

    @Post()
    create(@Body() body: Record<string, unknown>) {
        return this.geofencesService.create(body as never)
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.geofencesService.update(id, body as never)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.geofencesService.remove(id)
    }
}
