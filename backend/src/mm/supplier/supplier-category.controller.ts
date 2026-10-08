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
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/supplier-categories')
export class SupplierCategoryController {
    constructor(private service: SupplierCategoryService) {}

    @Post()
    @MmMutation(mmFeatures('supplier-management', 'supplier-categories'), 'create')
    create(@Body() dto: CreateSupplierCategoryDto) {
        return this.service.create(dto)
    }

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

    @Put(':id')
    @MmMutation(mmFeatures('supplier-management', 'supplier-categories'), 'update')
    update(@Param('id') id: string, @Body() dto: Partial<CreateSupplierCategoryDto>) {
        return this.service.update(id, dto)
    }

    @Delete(':id')
    @MmMutation(mmFeatures('supplier-management', 'supplier-categories'), 'delete')
    softDelete(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
