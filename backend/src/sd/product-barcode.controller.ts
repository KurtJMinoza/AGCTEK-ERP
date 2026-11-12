import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { RequirePermission } from '../permissions/permission.guard'
import { MmMutation } from '../mm/common/mm-mutation.decorator'
import { mmFeatures } from '../permissions/permissions.constants'
import {
    ProductBarcodeService,
    type QuickAddInput,
} from './product-barcode.service'

/**
 * Shared barcode lookup / quick-add for Material Master, Product Catalog and
 * POS. Lookup is read-only; quick-add creates the MM material first, then the
 * SD listing that references it.
 */
@Controller('sd/product-barcodes')
export class ProductBarcodeController {
    constructor(private readonly service: ProductBarcodeService) {}

    @Get(':code')
    @RequirePermission(['sd.product-catalog', 'sd.pos'], 'read')
    lookup(@Param('code') code: string, @Query('companyId') companyId?: string) {
        return this.service.lookup(code, companyId)
    }

    @Post('quick-add')
    @RequirePermission('sd.product-catalog', 'create')
    @MmMutation(mmFeatures('material-master', 'materials-skus'), 'create')
    quickAdd(@Body() body: QuickAddInput) {
        return this.service.quickAdd(body)
    }
}
