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

@Controller('mm/storage-shelves')
export class StorageShelvesController {
    constructor(private readonly service: StorageShelvesService) {}

    @Get()
    findAll(@Query('storageSectionId') storageSectionId?: string) {
        return this.service.findAll({ storageSectionId })
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() dto: CreateStorageShelfDto) {
        return this.service.create(dto)
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: UpdateStorageShelfDto) {
        return this.service.update(id, dto)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
