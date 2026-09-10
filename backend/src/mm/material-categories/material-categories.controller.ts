import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common'
import { MaterialCategoriesService } from './material-categories.service'

@Controller('mm/material-categories')
export class MaterialCategoriesController {
    constructor(private readonly service: MaterialCategoriesService) {}

    @Get()
    findAll() {
        return this.service.findAll()
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() body: { code?: string; name: string; description?: string; parentId?: string; sortOrder?: number }) {
        return this.service.create(body)
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() body: any) {
        return this.service.update(id, body)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
