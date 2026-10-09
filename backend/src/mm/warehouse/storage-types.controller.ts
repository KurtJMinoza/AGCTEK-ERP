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
import { StorageTypesService } from './storage-types.service'
import { CreateStorageTypeDto } from './dto/create-storage-type.dto'
import { UpdateStorageTypeDto } from './dto/update-storage-type.dto'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/storage-types')
export class StorageTypesController {
    constructor(private readonly service: StorageTypesService) {}

    @Get()
    @MmRead(MM_REFERENCE_READ)
    findAll(@Query('warehouseId') warehouseId?: string) {
        return this.service.findAll({ warehouseId })
    }

    @Get(':id')
    @MmRead(MM_REFERENCE_READ)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    @MmMutation(mmFeatures('warehouse-management', 'storage-types'), 'create')
    create(@Body() dto: CreateStorageTypeDto) {
        return this.service.create(dto)
    }

    @Put(':id')
    @MmMutation(mmFeatures('warehouse-management', 'storage-types'), 'update')
    update(@Param('id') id: string, @Body() dto: UpdateStorageTypeDto) {
        return this.service.update(id, dto)
    }

    @Delete(':id')
    @MmMutation(mmFeatures('warehouse-management', 'storage-types'), 'delete')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
