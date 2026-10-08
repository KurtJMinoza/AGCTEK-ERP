import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common'
import { UomService } from './uom.service'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/uom')
export class UomController {
    constructor(private readonly service: UomService) {}

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
    @MmMutation(mmFeatures('material-master', 'units-of-measure'), 'create')
    create(@Body() body: { code?: string; name: string; symbol?: string; sortOrder?: number }) {
        return this.service.create(body)
    }

    @Put(':id')
    @MmMutation(mmFeatures('material-master', 'units-of-measure'), 'update')
    update(@Param('id') id: string, @Body() body: any) {
        return this.service.update(id, body)
    }

    @Delete(':id')
    @MmMutation(mmFeatures('material-master', 'units-of-measure'), 'delete')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
