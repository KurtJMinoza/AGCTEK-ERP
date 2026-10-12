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
import { StorageShelvesService } from './storage-shelves.service'
import { CreateStorageShelfDto } from './dto/create-storage-shelf.dto'
import { UpdateStorageShelfDto } from './dto/update-storage-shelf.dto'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/storage-shelves')
export class StorageShelvesController {
    constructor(private readonly service: StorageShelvesService) {}

    @Get()
    @MmRead(MM_REFERENCE_READ)
    findAll(@Query('storageSectionId') storageSectionId?: string) {
        return this.service.findAll({ storageSectionId })
    }

    @Get(':id')
    @MmRead(MM_REFERENCE_READ)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    @MmMutation(mmFeatures('warehouse-management', 'storage-shelves'), 'create')
    create(@Body() dto: CreateStorageShelfDto) {
        return this.service.create(dto)
    }

    @Put(':id')
    @MmMutation(mmFeatures('warehouse-management', 'storage-shelves'), 'update')
    update(@Param('id') id: string, @Body() dto: UpdateStorageShelfDto) {
        return this.service.update(id, dto)
    }

    @Delete(':id')
    @MmMutation(mmFeatures('warehouse-management', 'storage-shelves'), 'delete')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
