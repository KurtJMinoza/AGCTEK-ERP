import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Query,
    Body,
} from '@nestjs/common'
import { MaterialValuationService } from './material-valuation.service'
import { CostLayerService } from './cost-layer.service'
import { ValuationEngineService } from './valuation-engine.service'
import { InventoryValueService } from './inventory-value.service'
import { LandedCostService } from './landed-cost.service'
import {
    UpsertMaterialValuationDto,
    UpdateMaterialValuationDto,
    ReviseStandardCostDto,
    MaterialValuationQueryDto,
    CostLayerQueryDto,
    ValuationTxnQueryDto,
    InventoryValueQueryDto,
    CreateLandedCostDto,
    LandedCostQueryDto,
    AllocatePreviewDto,
} from './dto/valuation.dto'

@Controller('mm/valuation')
export class ValuationController {
    constructor(
        private materialValuations: MaterialValuationService,
        private costLayers: CostLayerService,
        private engine: ValuationEngineService,
        private inventoryValue: InventoryValueService,
        private landedCosts: LandedCostService,
    ) {}

    @Get('material-valuations')
    listMaterialValuations(@Query() query: MaterialValuationQueryDto) {
        return this.materialValuations.findAll(query)
    }

    @Get('material-valuations/:id')
    getMaterialValuation(@Param('id') id: string) {
        return this.materialValuations.findOne(id)
    }

    @Post('material-valuations')
    upsertMaterialValuation(@Body() dto: UpsertMaterialValuationDto) {
        return this.materialValuations.upsert(dto)
    }

    @Patch('material-valuations/:id')
    updateMaterialValuation(
        @Param('id') id: string,
        @Body() dto: UpdateMaterialValuationDto,
    ) {
        return this.materialValuations.update(id, dto)
    }

    @Post('material-valuations/:id/revise-standard')
    reviseStandard(
        @Param('id') id: string,
        @Body() dto: ReviseStandardCostDto,
    ) {
        return this.materialValuations.reviseStandard(id, dto)
    }

    @Get('cost-layers')
    listCostLayers(@Query() query: CostLayerQueryDto) {
        return this.costLayers.findAll(query)
    }

    @Get('valuation-transactions')
    listValuationTxns(@Query() query: ValuationTxnQueryDto) {
        return this.engine.listValuationTransactions(query)
    }

    @Get('inventory-value')
    getInventoryValue(@Query() query: InventoryValueQueryDto) {
        return this.inventoryValue.query(query)
    }

    @Get('landed-costs')
    listLandedCosts(@Query() query: LandedCostQueryDto) {
        return this.landedCosts.findAll(query)
    }

    @Get('landed-costs/:id')
    getLandedCost(@Param('id') id: string) {
        return this.landedCosts.findOne(id)
    }

    @Post('landed-costs')
    createLandedCost(@Body() dto: CreateLandedCostDto) {
        return this.landedCosts.create(dto)
    }

    @Post('landed-costs/:id/allocate-preview')
    allocatePreview(
        @Param('id') id: string,
        @Body() dto: AllocatePreviewDto,
    ) {
        return this.landedCosts.allocatePreview(id, dto ?? {})
    }

    @Post('landed-costs/:id/capitalize')
    capitalize(
        @Param('id') id: string,
        @Body() dto: AllocatePreviewDto,
    ) {
        return this.landedCosts.allocateAndCapitalize(id, dto ?? {})
    }
}
