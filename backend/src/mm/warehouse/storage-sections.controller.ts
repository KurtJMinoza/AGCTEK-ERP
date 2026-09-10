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

@Controller('mm/storage-sections')
export class StorageSectionsController {
    constructor(private readonly service: StorageSectionsService) {}

    @Get()
    findAll(@Query('storageTypeId') storageTypeId?: string) {
        return this.service.findAll({ storageTypeId })
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() dto: CreateStorageSectionDto) {
        return this.service.create(dto)
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: UpdateStorageSectionDto) {
        return this.service.update(id, dto)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
