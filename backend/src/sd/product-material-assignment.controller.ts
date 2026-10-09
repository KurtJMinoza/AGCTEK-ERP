import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common'
import { ProductMaterialAssignmentService } from './product-material-assignment.service'
import { CreateProductMaterialAssignmentDto } from './dto/product-material-assignment.dto'
import { RequirePermission } from '../permissions/permission.guard'

@Controller('sd/product-material-assignments')
export class ProductMaterialAssignmentController {
    constructor(private readonly service: ProductMaterialAssignmentService) {}

    @Get('by-product/:productId')
    @RequirePermission('sd.product-catalog', 'read')
    listForProduct(@Param('productId') productId: string) {
        return this.service.listForProduct(productId)
    }

    @Post()
    @RequirePermission('sd.product-catalog', 'create')
    create(@Body() dto: CreateProductMaterialAssignmentDto) {
        return this.service.create(dto)
    }

    @Delete(':id')
    @RequirePermission('sd.product-catalog', 'delete')
    deactivate(@Param('id') id: string) {
        return this.service.deactivate(id)
    }

    @Get('by-material/:materialId')
    @RequirePermission('sd.product-catalog', 'read')
    listForMaterial(@Param('materialId') materialId: string) {
        return this.service.listForMaterial(materialId)
    }
}
