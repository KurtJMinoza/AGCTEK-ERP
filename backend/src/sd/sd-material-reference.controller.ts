import { Controller, Get, Param, Query } from '@nestjs/common'
import { SdMaterialReferenceService } from './sd-material-reference.service'

@Controller('sd/material-catalog-reference')
export class SdMaterialReferenceController {
    constructor(private readonly references: SdMaterialReferenceService) {}

    @Get('batch/preview')
    batchPreview(
        @Query('companyId') companyId: string,
        @Query('materialIds') materialIds: string,
        @Query('divisionId') divisionId?: string,
    ) {
        const ids = materialIds
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
        return this.references.getBatchForProductCatalog(ids, companyId, divisionId)
    }

    @Get(':materialId')
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
