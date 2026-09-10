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
import { SupplierPricingService, CreateSupplierPriceInput } from './supplier-pricing.service'

@Controller('mm/supplier-prices')
export class SupplierPricingController {
    constructor(private service: SupplierPricingService) {}

    @Get()
    findAll(
        @Query('supplierId') supplierId?: string,
        @Query('materialId') materialId?: string,
    ) {
        return this.service.findAll({ supplierId, materialId })
    }

    @Get('resolve')
    resolve(
        @Query('supplierId') supplierId: string,
        @Query('materialId') materialId: string,
        @Query('quantity') quantity?: string,
        @Query('asOf') asOf?: string,
    ) {
        return this.service.resolvePrice({
            supplierId,
            materialId,
            quantity: quantity != null ? Number(quantity) : 0,
            asOf,
        })
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() body: CreateSupplierPriceInput) {
        return this.service.create(body)
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() body: Partial<CreateSupplierPriceInput>) {
        return this.service.update(id, body)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
