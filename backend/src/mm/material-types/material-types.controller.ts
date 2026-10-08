import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common'
import { MaterialTypesService } from './material-types.service'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/material-types')
export class MaterialTypesController {
    constructor(private readonly service: MaterialTypesService) {}

    @Get()
    @MmRead(MM_REFERENCE_READ)
    findAll() {
        return this.service.findAll()
    }

    @Get(':id')
    @MmRead(MM_REFERENCE_READ)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    @MmMutation(mmFeatures('material-master', 'material-types'), 'create')
    create(@Body() body: { code?: string; name: string; description?: string; sortOrder?: number }) {
        return this.service.create(body)
    }

    @Put(':id')
    @MmMutation(mmFeatures('material-master', 'material-types'), 'update')
    update(@Param('id') id: string, @Body() body: any) {
        return this.service.update(id, body)
    }

    @Delete(':id')
    @MmMutation(mmFeatures('material-master', 'material-types'), 'delete')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
