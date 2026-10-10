import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
} from '@nestjs/common'
import { StorageSectionsService } from './storage-sections.service'
import { CreateStorageSectionDto } from './dto/create-storage-section.dto'
import { UpdateStorageSectionDto } from './dto/update-storage-section.dto'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/storage-sections')
export class StorageSectionsController {
    constructor(private readonly service: StorageSectionsService) {}

    @Get()
    @MmRead(MM_REFERENCE_READ)
    findAll(@Query('storageTypeId') storageTypeId?: string) {
        return this.service.findAll({ storageTypeId })
    }

    @Get(':id')
    @MmRead(MM_REFERENCE_READ)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    @MmMutation(mmFeatures('warehouse-management', 'storage-sections'), 'create')
    create(@Body() dto: CreateStorageSectionDto) {
        return this.service.create(dto)
    }

    @Put(':id')
    @MmMutation(mmFeatures('warehouse-management', 'storage-sections'), 'update')
    update(@Param('id') id: string, @Body() dto: UpdateStorageSectionDto) {
        return this.service.update(id, dto)
    }

    @Delete(':id')
    @MmMutation(mmFeatures('warehouse-management', 'storage-sections'), 'delete')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
