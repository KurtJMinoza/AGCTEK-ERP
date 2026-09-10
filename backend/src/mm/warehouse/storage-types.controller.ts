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

@Controller('mm/storage-types')
export class StorageTypesController {
    constructor(private readonly service: StorageTypesService) {}

    @Get()
    findAll(@Query('warehouseId') warehouseId?: string) {
        return this.service.findAll({ warehouseId })
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() dto: CreateStorageTypeDto) {
        return this.service.create(dto)
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: UpdateStorageTypeDto) {
        return this.service.update(id, dto)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
