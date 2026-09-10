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
    SuggestionQueryDto,
    ConvertSuggestionDto,
    PlanningDashboardQueryDto,
} from './dto/planning.dto'

@Controller('mm/planning')
export class PlanningController {
    constructor(
        private reorderRules: ReorderRuleService,
        private demand: PlanningDemandService,
        private mrpRuns: MrpRunService,
        private suggestions: ProcurementSuggestionService,
        private dashboard: PlanningDashboardService,
    ) {}

    @Get('dashboard')
    getDashboard(@Query() query: PlanningDashboardQueryDto) {
        return this.dashboard.getDashboard(query)
    }

    // ── Reorder rules ──────────────────────────────────────────────

    @Get('reorder-rules')
    listRules(@Query() query: ReorderRuleQueryDto) {
        return this.reorderRules.findAll(query)
    }

    @Get('reorder-rules/:id')
    getRule(@Param('id') id: string) {
        return this.reorderRules.findOne(id)
    }

    @Post('reorder-rules')
    createRule(@Body() dto: CreateReorderRuleDto) {
        return this.reorderRules.create(dto)
    }

    @Patch('reorder-rules/:id')
    updateRule(@Param('id') id: string, @Body() dto: UpdateReorderRuleDto) {
        return this.reorderRules.update(id, dto)
    }

    @Delete('reorder-rules/:id')
    deleteRule(@Param('id') id: string) {
        return this.reorderRules.remove(id)
    }

    // ── Planning demand ────────────────────────────────────────────

    @Get('demand')
    listDemand(@Query() query: PlanningDemandQueryDto) {
        return this.demand.findAll(query)
    }

    @Get('demand/:id')
    getDemand(@Param('id') id: string) {
        return this.demand.findOne(id)
    }

    @Post('demand')
    createDemand(@Body() dto: CreatePlanningDemandDto) {
        return this.demand.create(dto)
    }

    @Patch('demand/:id')
    updateDemand(@Param('id') id: string, @Body() dto: UpdatePlanningDemandDto) {
        return this.demand.update(id, dto)
    }

    @Delete('demand/:id')
    deleteDemand(@Param('id') id: string) {
        return this.demand.remove(id)
    }

    // ── MRP runs ───────────────────────────────────────────────────

    @Get('mrp-runs')
    listRuns(@Query() query: MrpRunQueryDto) {
        return this.mrpRuns.findAll(query)
    }

    @Get('mrp-runs/:id')
    getRun(@Param('id') id: string) {
        return this.mrpRuns.findOne(id)
    }

    @Post('mrp-runs')
    createRun(@Body() dto: CreateMrpRunDto) {
        return this.mrpRuns.create(dto)
    }

    @Post('mrp-runs/:id/execute')
    executeRun(@Param('id') id: string) {
        return this.mrpRuns.execute(id)
    }

    // ── Material requirements ──────────────────────────────────────

    @Get('material-requirements')
    listRequirements(@Query() query: MaterialRequirementQueryDto) {
        return this.mrpRuns.listRequirements(query)
    }

    // ── Suggestions ────────────────────────────────────────────────

    @Get('suggestions')
    listSuggestions(@Query() query: SuggestionQueryDto) {
        return this.suggestions.findAll(query)
    }

    @Get('suggestions/:id')
    getSuggestion(@Param('id') id: string) {
        return this.suggestions.findOne(id)
    }

    @Post('suggestions/:id/convert-pr')
    convertPr(@Param('id') id: string, @Body() dto: ConvertSuggestionDto) {
        return this.suggestions.convertToPr(id, dto)
    }

    @Post('suggestions/:id/dismiss')
    dismiss(@Param('id') id: string) {
        return this.suggestions.dismiss(id)
    }
}
