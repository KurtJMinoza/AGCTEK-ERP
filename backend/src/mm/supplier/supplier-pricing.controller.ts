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
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/supplier-prices')
export class SupplierPricingController {
    constructor(private service: SupplierPricingService) {}

    @Get()
    @MmRead(MM_REFERENCE_READ)
    findAll(
        @Query('supplierId') supplierId?: string,
        @Query('materialId') materialId?: string,
    ) {
        return this.service.findAll({ supplierId, materialId })
    }

    @Get('resolve')
    @MmRead(MM_REFERENCE_READ)
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
    @MmRead(MM_REFERENCE_READ)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    @MmMutation(mmFeatures('supplier-management', 'supplier-pricing'), 'create')
    create(@Body() body: CreateSupplierPriceInput) {
        return this.service.create(body)
    }

    @Put(':id')
    @MmMutation(mmFeatures('supplier-management', 'supplier-pricing'), 'update')
    update(@Param('id') id: string, @Body() body: Partial<CreateSupplierPriceInput>) {
        return this.service.update(id, body)
    }

    @Delete(':id')
    @MmMutation(mmFeatures('supplier-management', 'supplier-pricing'), 'delete')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
