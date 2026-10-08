import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Query,
    Body,
} from '@nestjs/common'
import { ReorderRuleService } from './reorder-rule.service'
import { PlanningDemandService } from './planning-demand.service'
import { MrpRunService } from './mrp-run.service'
import { ProcurementSuggestionService } from './procurement-suggestion.service'
import { PlanningDashboardService } from './planning-dashboard.service'
import { ProjectedStockService } from './projected-stock.service'
import {
    CreateReorderRuleDto,
    UpdateReorderRuleDto,
    ReorderRuleQueryDto,
    CreatePlanningDemandDto,
    UpdatePlanningDemandDto,
    PlanningDemandQueryDto,
    CreateMrpRunDto,
    MrpRunQueryDto,
    MaterialRequirementQueryDto,
    BomExplosionTraceQueryDto,
    SuggestionQueryDto,
    ConvertSuggestionDto,
    PlanningDashboardQueryDto,
    ProjectedStockQueryDto,
} from './dto/planning.dto'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/**
 * Planning / MRP API.
 * Canonical Phase 10 aliases coexist with legacy paths.
 * MRP never posts inventory.
 */
/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('planning-mrp', 'demand', 'mrp-runs', 'projected-stock', 'material-requirements', 'reorder-point', 'safety-stock', 'shortage-monitor', 'procurement-suggestions')

@Controller('mm/planning')
export class PlanningController {
    constructor(
        private reorderRules: ReorderRuleService,
        private demand: PlanningDemandService,
        private mrpRuns: MrpRunService,
        private suggestions: ProcurementSuggestionService,
        private dashboard: PlanningDashboardService,
        private projectedStock: ProjectedStockService,
    ) {}

    @Get('dashboard')
    @MmRead(READERS)
    getDashboard(@Query() query: PlanningDashboardQueryDto) {
        return this.dashboard.getDashboard(query)
    }

    // ── Planning parameters (canonical) / reorder rules (legacy) ───

    @Get('planning-parameters')
    @MmRead(READERS)
    listPlanningParameters(@Query() query: ReorderRuleQueryDto) {
        return this.reorderRules.findAll(query)
    }

    @Post('planning-parameters')
    @MmMutation(mmFeatures('planning-mrp', 'reorder-point', 'safety-stock'), 'create')
    createPlanningParameter(@Body() dto: CreateReorderRuleDto) {
        return this.reorderRules.create(dto)
    }

    @Patch('planning-parameters/:id')
    @MmMutation(mmFeatures('planning-mrp', 'reorder-point', 'safety-stock'), 'update')
    updatePlanningParameter(
        @Param('id') id: string,
        @Body() dto: UpdateReorderRuleDto,
    ) {
        return this.reorderRules.update(id, dto)
    }

    @Get('reorder-rules')
    @MmRead(READERS)
    listRules(@Query() query: ReorderRuleQueryDto) {
        return this.reorderRules.findAll(query)
    }

    @Get('reorder-rules/:id')
    @MmRead(READERS)
    getRule(@Param('id') id: string) {
        return this.reorderRules.findOne(id)
    }

    @Post('reorder-rules')
    @MmMutation(mmFeatures('planning-mrp', 'reorder-point'), 'create')
    createRule(@Body() dto: CreateReorderRuleDto) {
        return this.reorderRules.create(dto)
    }

    @Patch('reorder-rules/:id')
    @MmMutation(mmFeatures('planning-mrp', 'reorder-point'), 'update')
    updateRule(@Param('id') id: string, @Body() dto: UpdateReorderRuleDto) {
        return this.reorderRules.update(id, dto)
    }

    @Delete('reorder-rules/:id')
    @MmMutation(mmFeatures('planning-mrp', 'reorder-point'), 'delete')
    deleteRule(@Param('id') id: string) {
        return this.reorderRules.remove(id)
    }

    // ── Planning demand ────────────────────────────────────────────

    @Get('demand')
    @MmRead(READERS)
    listDemand(@Query() query: PlanningDemandQueryDto) {
        return this.demand.findAll(query)
    }

    @Get('demand/:id')
    @MmRead(READERS)
    getDemand(@Param('id') id: string) {
        return this.demand.findOne(id)
    }

    @Post('demand')
    @MmMutation(mmFeatures('planning-mrp', 'demand'), 'create')
    createDemand(@Body() dto: CreatePlanningDemandDto) {
        return this.demand.create(dto)
    }

    /** Canonical alias */
    @Get('demands')
    @MmRead(READERS)
    listDemands(@Query() query: PlanningDemandQueryDto) {
        return this.demand.findAll(query)
    }

    /** Canonical alias */
    @Post('demands')
    @MmMutation(mmFeatures('planning-mrp', 'demand'), 'create')
    createDemandAlias(@Body() dto: CreatePlanningDemandDto) {
        return this.demand.create(dto)
    }

    @Patch('demand/:id')
    @MmMutation(mmFeatures('planning-mrp', 'demand'), 'update')
    updateDemand(@Param('id') id: string, @Body() dto: UpdatePlanningDemandDto) {
        return this.demand.update(id, dto)
    }

    @Post('demand/:id/cancel')
    @MmMutation(mmFeatures('planning-mrp', 'demand'), 'update')
    cancelDemand(@Param('id') id: string) {
        return this.demand.cancel(id)
    }

    @Delete('demand/:id')
    @MmMutation(mmFeatures('planning-mrp', 'demand'), 'delete')
    deleteDemand(@Param('id') id: string) {
        return this.demand.remove(id)
    }

    // ── MRP runs ───────────────────────────────────────────────────

    @Get('mrp-runs')
    @MmRead(READERS)
    listRuns(@Query() query: MrpRunQueryDto) {
        return this.mrpRuns.findAll(query)
    }

    @Get('mrp-runs/:id')
    @MmRead(READERS)
    getRun(@Param('id') id: string) {
        return this.mrpRuns.findOne(id)
    }

    @Post('mrp-runs')
    @MmMutation(mmFeatures('planning-mrp', 'mrp-runs'), 'create')
    createRun(@Body() dto: CreateMrpRunDto) {
        return this.mrpRuns.create(dto)
    }

    @Post('mrp-runs/:id/execute')
    @MmMutation(mmFeatures('planning-mrp', 'mrp-runs'), 'update')
    executeRun(@Param('id') id: string) {
        return this.mrpRuns.execute(id)
    }

    @Post('mrp-runs/:id/cancel')
    @MmMutation(mmFeatures('planning-mrp', 'mrp-runs'), 'update')
    cancelRun(@Param('id') id: string) {
        return this.mrpRuns.cancel(id)
    }

    // ── Material / MRP requirements ───────────────────────────────

    @Get('material-requirements')
    @MmRead(READERS)
    listRequirements(@Query() query: MaterialRequirementQueryDto) {
        return this.mrpRuns.listRequirements(query)
    }

    /** Canonical alias */
    @Get('requirements')
    @MmRead(READERS)
    listRequirementsCanonical(@Query() query: MaterialRequirementQueryDto) {
        return this.mrpRuns.listRequirements(query)
    }

    @Get('shortages')
    @MmRead(READERS)
    listShortages(@Query() query: MaterialRequirementQueryDto) {
        return this.mrpRuns.listRequirements({ ...query, shortage: true })
    }

    @Get('bom-explosion-traces')
    @MmRead(READERS)
    listBomExplosionTraces(@Query() query: BomExplosionTraceQueryDto) {
        return this.mrpRuns.listBomExplosionTraces(query)
    }

    @Get('planned-orders')
    @MmRead(READERS)
    listPlannedOrders(@Query() query: MaterialRequirementQueryDto) {
        return this.mrpRuns.listPlannedOrders(query)
    }

    // ── Suggestions ────────────────────────────────────────────────

    @Get('suggestions')
    @MmRead(READERS)
    listSuggestions(@Query() query: SuggestionQueryDto) {
        return this.suggestions.findAll(query)
    }

    /** Canonical alias */
    @Get('procurement-suggestions')
    @MmRead(READERS)
    listProcurementSuggestions(@Query() query: SuggestionQueryDto) {
        return this.suggestions.findAll(query)
    }

    @Get('suggestions/:id')
    @MmRead(READERS)
    getSuggestion(@Param('id') id: string) {
        return this.suggestions.findOne(id)
    }

    @Post('suggestions/:id/convert-pr')
    @MmMutation(mmFeatures('planning-mrp', 'procurement-suggestions'), 'update')
    convertPr(@Param('id') id: string, @Body() dto: ConvertSuggestionDto) {
        return this.suggestions.convertToPr(id, dto)
    }

    /** Canonical alias */
    @Post('suggestions/:id/create-pr')
    @MmMutation(mmFeatures('planning-mrp', 'procurement-suggestions'), 'update')
    createPr(@Param('id') id: string, @Body() dto: ConvertSuggestionDto) {
        return this.suggestions.convertToPr(id, dto)
    }

    @Post('suggestions/:id/dismiss')
    @MmMutation(mmFeatures('planning-mrp', 'procurement-suggestions'), 'update')
    dismiss(@Param('id') id: string) {
        return this.suggestions.dismiss(id)
    }

    // ── Projected stock (Phase 2A) ─────────────────────────────────

    @Get('projected-stock')
    @MmRead(READERS)
    listProjectedStock(@Query() query: ProjectedStockQueryDto) {
        return this.projectedStock.findAll(query)
    }
}
