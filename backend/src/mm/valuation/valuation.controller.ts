import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Query,
    Body,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common'
import { MaterialValuationService } from './material-valuation.service'
import { CostLayerService } from './cost-layer.service'
import { ValuationEngineService } from './valuation-engine.service'
import { InventoryValueService } from './inventory-value.service'
import { LandedCostService } from './landed-cost.service'
import { CostElementService } from './cost-element.service'
import { PriceVarianceService } from './price-variance.service'
import { MmMutation } from '../common/mm-mutation.decorator'
import {
    UpsertMaterialValuationDto,
    UpdateMaterialValuationDto,
    ReviseStandardCostDto,
    MaterialValuationQueryDto,
    CostLayerQueryDto,
    CreateCostLayerDto,
    ValuationTxnQueryDto,
    InventoryValueQueryDto,
    CreateLandedCostDto,
    LandedCostQueryDto,
    AllocatePreviewDto,
    UpsertCostElementDto,
    CostElementQueryDto,
    PriceVarianceQueryDto,
} from './dto/valuation.dto'

@Controller('mm/valuation')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ValuationController {
    constructor(
        private materialValuations: MaterialValuationService,
        private costLayers: CostLayerService,
        private engine: ValuationEngineService,
        private inventoryValue: InventoryValueService,
        private landedCosts: LandedCostService,
        private costElements: CostElementService,
        private priceVariances: PriceVarianceService,
    ) {}

    // ─── Profiles (canonical alias of material-valuations) ──────

    @Get('profiles')
    listProfiles(@Query() query: MaterialValuationQueryDto) {
        return this.materialValuations.findAll(query)
    }

    @MmMutation()
    @Post('profiles')
    upsertProfile(@Body() dto: UpsertMaterialValuationDto) {
        return this.materialValuations.upsert(dto)
    }

    // ─── Material valuations (legacy) ───────────────────────────

    @Get('material-valuations')
    listMaterialValuations(@Query() query: MaterialValuationQueryDto) {
        return this.materialValuations.findAll(query)
    }

    @Get('material-valuations/:id')
    getMaterialValuation(@Param('id') id: string) {
        return this.materialValuations.findOne(id)
    }

    @MmMutation()
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

    @MmMutation()
    @Post('material-valuations/:id/revise-standard')
    reviseStandard(
        @Param('id') id: string,
        @Body() dto: ReviseStandardCostDto,
    ) {
        return this.materialValuations.reviseStandard(id, dto)
    }

    // ─── Cost layers ────────────────────────────────────────────

    @Get('cost-layers')
    listCostLayers(@Query() query: CostLayerQueryDto) {
        return this.costLayers.findAll(query)
    }

    @MmMutation()
    @Post('cost-layers')
    createCostLayer(@Body() dto: CreateCostLayerDto) {
        return this.costLayers.createFromReceiptTxn(dto)
    }

    // ─── Inventory value ────────────────────────────────────────

    @Get('inventory')
    getInventory(@Query() query: InventoryValueQueryDto) {
        return this.inventoryValue.query(query)
    }

    @Get('inventory-value')
    getInventoryValue(@Query() query: InventoryValueQueryDto) {
        return this.inventoryValue.query(query)
    }

    @Get('valuation-transactions')
    listValuationTxns(@Query() query: ValuationTxnQueryDto) {
        return this.engine.listValuationTransactions(query)
    }

    // ─── Price variance ─────────────────────────────────────────

    @Get('price-variance')
    listPriceVariance(@Query() query: PriceVarianceQueryDto) {
        return this.priceVariances.findAll(query)
    }

    // ─── Cost elements ──────────────────────────────────────────

    @Get('cost-elements')
    listCostElements(@Query() query: CostElementQueryDto) {
        return this.costElements.findAll(query)
    }

    @MmMutation()
    @Post('cost-elements')
    upsertCostElement(@Body() dto: UpsertCostElementDto) {
        return this.costElements.upsert(dto)
    }

    @MmMutation()
    @Post('cost-elements/ensure-defaults')
    ensureCostElementDefaults(@Body() dto: { companyId: string }) {
        return this.costElements.ensureDefaults(dto.companyId)
    }

    // ─── Landed cost (legacy + canonical aliases) ───────────────

    @Get('landed-costs')
    listLandedCosts(@Query() query: LandedCostQueryDto) {
        return this.landedCosts.findAll(query)
    }

    @Get('landed-costs/:id')
    getLandedCost(@Param('id') id: string) {
        return this.landedCosts.findOne(id)
    }

    @MmMutation()
    @Post('landed-costs')
    createLandedCost(@Body() dto: CreateLandedCostDto) {
        return this.landedCosts.create(dto)
    }

    @MmMutation()
    @Post('landed-cost')
    createLandedCostCanonical(@Body() dto: CreateLandedCostDto) {
        return this.landedCosts.create(dto)
    }

    @MmMutation()
    @Post('landed-costs/:id/allocate-preview')
    allocatePreview(
        @Param('id') id: string,
        @Body() dto: AllocatePreviewDto,
    ) {
        return this.landedCosts.allocatePreview(id, dto ?? {})
    }

    @MmMutation()
    @Post('landed-costs/:id/capitalize')
    capitalize(
        @Param('id') id: string,
        @Body() dto: AllocatePreviewDto,
    ) {
        return this.landedCosts.allocateAndCapitalize(id, dto ?? {})
    }

    @MmMutation()
    @Post('landed-cost/:id/allocate')
    allocateCanonical(
        @Param('id') id: string,
        @Body() dto: AllocatePreviewDto,
    ) {
        return this.landedCosts.allocate(id, dto ?? {})
    }
}
