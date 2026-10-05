import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common'
import { ProductMaterialAssignmentService } from './product-material-assignment.service'
import { CreateProductMaterialAssignmentDto } from './dto/product-material-assignment.dto'

@Controller('sd/product-material-assignments')
export class ProductMaterialAssignmentController {
    constructor(private readonly service: ProductMaterialAssignmentService) {}

    @Get('by-product/:productId')
    listForProduct(@Param('productId') productId: string) {
        return this.service.listForProduct(productId)
    }

    @Post()
    create(@Body() dto: CreateProductMaterialAssignmentDto) {
        return this.service.create(dto)
    }

    @Delete(':id')
    deactivate(@Param('id') id: string) {
        return this.service.deactivate(id)
    }

    @Get('by-material/:materialId')
    listForMaterial(@Param('materialId') materialId: string) {
        return this.service.listForMaterial(materialId)
    }
}
