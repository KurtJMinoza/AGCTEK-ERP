import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common'
import { SdMaterialReferenceService } from './sd-material-reference.service'
import { RequirePermission } from '../permissions/permission.guard'

const emptyBatch = (companyId: string, divisionId?: string) => ({
    materials: [],
    totals: {
        availableQty: 0,
        onHandQty: 0,
        maximumStock: 0,
        safetyStock: 0,
        stockAvailable: 0,
    },
    companyId: companyId.trim(),
    divisionId: divisionId?.trim() || null,
})

@Controller('sd/material-catalog-reference')
export class SdMaterialReferenceController {
    constructor(private readonly references: SdMaterialReferenceService) {}

    @Get('batch/preview')
    @RequirePermission(['sd.product-catalog', 'sd.material-sales-view'], 'read')
    batchPreview(
        @Query('companyId') companyId: string,
        @Query('materialIds') materialIds?: string,
        @Query('divisionId') divisionId?: string,
    ) {
        if (!companyId?.trim()) {
            throw new BadRequestException('companyId is required')
        }
        const ids = (materialIds ?? '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
        if (!ids.length) {
            return emptyBatch(companyId, divisionId)
        }
        return this.references.getBatchForProductCatalog(ids, companyId, divisionId)
    }

    @Get(':materialId')
    @RequirePermission(['sd.product-catalog', 'sd.material-sales-view'], 'read')
    preview(
        @Param('materialId') materialId: string,
        @Query('companyId') companyId: string,
        @Query('divisionId') divisionId?: string,
    ) {
        return this.references.getForProductCatalog(
            materialId,
            companyId,
            divisionId,
        )
    }
}
