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
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'
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

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('valuation', 'cost-layers', 'fifo', 'inventory-valuation', 'landed-cost', 'moving-average', 'price-variance', 'standard-cost')

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
    @MmRead(READERS)
    listProfiles(@Query() query: MaterialValuationQueryDto) {
        return this.materialValuations.findAll(query)
    }

    @MmMutation(mmFeatures('valuation', 'inventory-valuation'))
    @Post('profiles')
    upsertProfile(@Body() dto: UpsertMaterialValuationDto) {
        return this.materialValuations.upsert(dto)
    }

    // ─── Material valuations (legacy) ───────────────────────────

    @Get('material-valuations')
    @MmRead(READERS)
    listMaterialValuations(@Query() query: MaterialValuationQueryDto) {
        return this.materialValuations.findAll(query)
    }

    @Get('material-valuations/:id')
    @MmRead(READERS)
    getMaterialValuation(@Param('id') id: string) {
        return this.materialValuations.findOne(id)
    }

    @MmMutation(mmFeatures('valuation', 'inventory-valuation'))
    @Post('material-valuations')
    upsertMaterialValuation(@Body() dto: UpsertMaterialValuationDto) {
        return this.materialValuations.upsert(dto)
    }

    @Patch('material-valuations/:id')
    @MmMutation(mmFeatures('valuation', 'inventory-valuation', 'standard-cost', 'moving-average'), 'update')
    updateMaterialValuation(
        @Param('id') id: string,
        @Body() dto: UpdateMaterialValuationDto,
    ) {
        return this.materialValuations.update(id, dto)
    }

    @MmMutation(mmFeatures('valuation', 'standard-cost'))
    @Post('material-valuations/:id/revise-standard')
    reviseStandard(
        @Param('id') id: string,
        @Body() dto: ReviseStandardCostDto,
    ) {
        return this.materialValuations.reviseStandard(id, dto)
    }

    // ─── Cost layers ────────────────────────────────────────────

    @Get('cost-layers')
    @MmRead(READERS)
    listCostLayers(@Query() query: CostLayerQueryDto) {
        return this.costLayers.findAll(query)
    }

    @MmMutation(mmFeatures('valuation', 'cost-layers'))
    @Post('cost-layers')
    createCostLayer(@Body() dto: CreateCostLayerDto) {
        return this.costLayers.createFromReceiptTxn(dto)
    }

    // ─── Inventory value ────────────────────────────────────────

    @Get('inventory')
    @MmRead(READERS)
    getInventory(@Query() query: InventoryValueQueryDto) {
        return this.inventoryValue.query(query)
    }

    @Get('inventory-value')
    @MmRead(READERS)
    getInventoryValue(@Query() query: InventoryValueQueryDto) {
        return this.inventoryValue.query(query)
    }

    @Get('valuation-transactions')
    @MmRead(READERS)
    listValuationTxns(@Query() query: ValuationTxnQueryDto) {
        return this.engine.listValuationTransactions(query)
    }

    // ─── Price variance ─────────────────────────────────────────

    @Get('price-variance')
    @MmRead(READERS)
    listPriceVariance(@Query() query: PriceVarianceQueryDto) {
        return this.priceVariances.findAll(query)
    }

    // ─── Cost elements ──────────────────────────────────────────

    @Get('cost-elements')
    @MmRead(READERS)
    listCostElements(@Query() query: CostElementQueryDto) {
        return this.costElements.findAll(query)
    }

    @MmMutation(mmFeatures('valuation', 'landed-cost'))
    @Post('cost-elements')
    upsertCostElement(@Body() dto: UpsertCostElementDto) {
        return this.costElements.upsert(dto)
    }

    @MmMutation(mmFeatures('valuation', 'landed-cost'))
    @Post('cost-elements/ensure-defaults')
    ensureCostElementDefaults(@Body() dto: { companyId: string }) {
        return this.costElements.ensureDefaults(dto.companyId)
    }

    // ─── Landed cost (legacy + canonical aliases) ───────────────

    @Get('landed-costs')
    @MmRead(READERS)
    listLandedCosts(@Query() query: LandedCostQueryDto) {
        return this.landedCosts.findAll(query)
    }

    @Get('landed-costs/:id')
    @MmRead(READERS)
    getLandedCost(@Param('id') id: string) {
        return this.landedCosts.findOne(id)
    }

    @MmMutation(mmFeatures('valuation', 'landed-cost'))
    @Post('landed-costs')
    createLandedCost(@Body() dto: CreateLandedCostDto) {
        return this.landedCosts.create(dto)
    }

    @MmMutation(mmFeatures('valuation', 'landed-cost'))
    @Post('landed-cost')
    createLandedCostCanonical(@Body() dto: CreateLandedCostDto) {
        return this.landedCosts.create(dto)
    }

    @MmMutation(mmFeatures('valuation', 'landed-cost'))
    @Post('landed-costs/:id/allocate-preview')
    allocatePreview(
        @Param('id') id: string,
        @Body() dto: AllocatePreviewDto,
    ) {
        return this.landedCosts.allocatePreview(id, dto ?? {})
    }

    @MmMutation(mmFeatures('valuation', 'landed-cost'))
    @Post('landed-costs/:id/capitalize')
    capitalize(
        @Param('id') id: string,
        @Body() dto: AllocatePreviewDto,
    ) {
        return this.landedCosts.allocateAndCapitalize(id, dto ?? {})
    }

    @MmMutation(mmFeatures('valuation', 'landed-cost'))
    @Post('landed-cost/:id/allocate')
    allocateCanonical(
        @Param('id') id: string,
        @Body() dto: AllocatePreviewDto,
    ) {
        return this.landedCosts.allocate(id, dto ?? {})
    }
}
