import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    Query,
} from '@nestjs/common'
import { SupplierMaterialService } from './supplier-material.service'
import { CreateSupplierMaterialDto } from './dto/create-supplier-material.dto'

@Controller('mm/supplier-materials')
export class SupplierMaterialController {
    constructor(private service: SupplierMaterialService) {}

    @Post()
    create(@Body() dto: CreateSupplierMaterialDto) {
        return this.service.create(dto)
    }

    @Get()
    findAll(@Query() query: { supplierId?: string; materialId?: string; page?: string; pageSize?: string }) {
        return this.service.findAll({
            supplierId: query.supplierId,
            materialId: query.materialId,
            page: query.page ? parseInt(query.page, 10) : undefined,
            pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
        })
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: Partial<CreateSupplierMaterialDto>) {
        return this.service.update(id, dto)
    }

    @Post(':id/deactivate')
    deactivate(@Param('id') id: string) {
        return this.service.deactivate(id)
    }

    @Delete(':id')
    delete(@Param('id') id: string) {
        return this.service.delete(id)
    }
}
