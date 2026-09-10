import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
} from '@nestjs/common'
import { SupplierCategoryService } from './supplier-category.service'
import { CreateSupplierCategoryDto } from './dto/create-supplier-category.dto'

@Controller('mm/supplier-categories')
export class SupplierCategoryController {
    constructor(private service: SupplierCategoryService) {}

    @Post()
    create(@Body() dto: CreateSupplierCategoryDto) {
        return this.service.create(dto)
    }

    @Get()
    findAll() {
        return this.service.findAll()
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: Partial<CreateSupplierCategoryDto>) {
        return this.service.update(id, dto)
    }

    @Delete(':id')
    softDelete(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
