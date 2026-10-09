import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Query,
    Body,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common'
import { CountRuleService } from './count-rule.service'
import { InventoryCountService } from './inventory-count.service'
import { CountPolicyService } from './count-policy.service'
import { CountPlanService } from './count-plan.service'
import { CountSessionService } from './count-session.service'
import { CountTaskService } from './count-task.service'
import { CountEntryService } from './count-entry.service'
import { CountRecountService } from './count-recount.service'
import { CountAdjustmentRequestService } from './count-adjustment-request.service'
import { CountVarianceService } from './count-variance.service'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'
import {
    CreateCountRuleDto,
    UpdateCountRuleDto,
    CountRuleQueryDto,
    CreateInventoryCountDto,
    InventoryCountQueryDto,
    GenerateCountDto,
    BlindCountDto,
    RecountDto,
    ApproveCountDto,
    RejectCountDto,
    CountLineQueryDto,
} from './dto/inventory-control.dto'
import {
    CreateCountPolicyDto,
    UpdateCountPolicyDto,
    CountPolicyQueryDto,
    CreateCountPlanDto,
    CountPlanQueryDto,
    GenerateCountPlanDto,
    CreateCountSessionDto,
    CountSessionQueryDto,
    CountTaskQueryDto,
    CreateCountEntryDto,
    CreateRecountDto,
    CreateAdjustmentRequestDto,
    ApproveAdjustmentRequestDto,
    RejectAdjustmentRequestDto,
    AdjustmentRequestQueryDto,
} from './dto/count-engine.dto'

/** Read access: the pages that load these endpoints. */
const READERS = [...mmFeatures('barcode-rfid', 'mobile-counting'), ...mmFeatures('inventory-control', 'adjustment-approval', 'blind-counting', 'count-history', 'count-planning', 'count-sessions', 'cycle-counting', 'physical-inventory', 'recounts', 'variance-analysis')]

@Controller('mm/inventory-control')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class InventoryControlController {
    constructor(
        private rules: CountRuleService,
        private counts: InventoryCountService,
        private policies: CountPolicyService,
        private plans: CountPlanService,
        private sessions: CountSessionService,
        private tasks: CountTaskService,
        private entries: CountEntryService,
        private recounts: CountRecountService,
        private adjustmentRequests: CountAdjustmentRequestService,
        private variances: CountVarianceService,
    ) {}

    // ── Phase 7: Count policies ────────────────────────────────────

    @Get('count-policies')
    @MmRead(READERS)
    listPolicies(@Query() query: CountPolicyQueryDto) {
        return this.policies.findAll(query)
    }

    @Get('count-policies/:id')
    @MmRead(READERS)
    getPolicy(@Param('id') id: string) {
        return this.policies.findOne(id)
    }

    @MmMutation(mmFeatures('inventory-control', 'count-planning'))
    @Post('count-policies')
    createPolicy(@Body() dto: CreateCountPolicyDto) {
        return this.policies.create(dto)
    }

    @Patch('count-policies/:id')
    @MmMutation(mmFeatures('inventory-control', 'count-planning'), 'update')
    updatePolicy(@Param('id') id: string, @Body() dto: UpdateCountPolicyDto) {
        return this.policies.update(id, dto)
    }

    // ── Phase 7: Count plans ───────────────────────────────────────

    @Get('count-plans')
    @MmRead(READERS)
    listPlans(@Query() query: CountPlanQueryDto) {
        return this.plans.findAll(query)
    }

    @Get('count-plans/:id')
    @MmRead(READERS)
    getPlan(@Param('id') id: string) {
        return this.plans.findOne(id)
    }

    @MmMutation(mmFeatures('inventory-control', 'count-planning'))
    @Post('count-plans')
    createPlan(@Body() dto: CreateCountPlanDto) {
        return this.plans.create(dto)
    }

    @MmMutation(mmFeatures('inventory-control', 'count-planning'))
    @Post('count-plans/:id/generate')
    generatePlan(@Param('id') id: string, @Body() dto: GenerateCountPlanDto) {
        return this.plans.generate(id, dto ?? {})
    }

    // ── Phase 7: Count sessions ────────────────────────────────────

    @Get('count-sessions')
    @MmRead(READERS)
    listSessions(@Query() query: CountSessionQueryDto) {
        return this.sessions.findAll(query)
    }

    @Get('count-sessions/:id')
    @MmRead(READERS)
    getSession(@Param('id') id: string, @Query('blind') blind?: string) {
        return this.sessions.findOne(id, { blind: blind === 'true' || blind === '1' })
    }

    @MmMutation(mmFeatures('inventory-control', 'count-sessions'))
    @Post('count-sessions')
    createSession(@Body() dto: CreateCountSessionDto) {
        return this.sessions.create(dto)
    }

    @MmMutation(mmFeatures('inventory-control', 'count-sessions'))
    @Post('count-sessions/:id/start')
    startSession(@Param('id') id: string) {
        return this.sessions.start(id)
    }

    @MmMutation(mmFeatures('inventory-control', 'count-sessions'))
    @Post('count-sessions/:id/close')
    closeSession(@Param('id') id: string) {
        return this.sessions.close(id)
    }

    // ── Phase 7: Count tasks / entries ────────────────────────────

    @Get('count-tasks')
    @MmRead(READERS)
    listTasks(@Query() query: CountTaskQueryDto) {
        return this.tasks.findAll(query)
    }

    @MmMutation(mmFeatures('inventory-control', 'count-sessions', 'cycle-counting', 'physical-inventory', 'blind-counting'))
    @Post('count-tasks')
    createTaskPlaceholder() {
        return { message: 'Tasks are generated via count-plans/:id/generate' }
    }

    @MmMutation(mmFeatures('inventory-control', 'count-sessions', 'cycle-counting', 'physical-inventory', 'blind-counting'))
    @Post('count-entries')
    createEntry(@Body() dto: CreateCountEntryDto) {
        return this.entries.create(dto)
    }

    // ── Phase 7: Recounts ──────────────────────────────────────────

    @Get('recounts')
    @MmRead(READERS)
    listRecounts(@Query() query: { taskId?: string; status?: string }) {
        return this.recounts.findAll(query)
    }

    @MmMutation(mmFeatures('inventory-control', 'recounts'))
    @Post('recounts')
    createRecount(@Body() dto: CreateRecountDto) {
        return this.recounts.create(dto)
    }

    // ── Phase 7: Adjustment requests ───────────────────────────────

    @Get('adjustment-requests')
    @MmRead(READERS)
    listAdjRequests(@Query() query: AdjustmentRequestQueryDto) {
        return this.adjustmentRequests.findAll(query)
    }

    @Get('adjustment-requests/:id')
    @MmRead(READERS)
    getAdjRequest(@Param('id') id: string) {
        return this.adjustmentRequests.findOne(id)
    }

    @MmMutation(mmFeatures('inventory-control', 'variance-analysis', 'adjustment-approval'))
    @Post('adjustment-requests')
    createAdjRequest(@Body() dto: CreateAdjustmentRequestDto) {
        return this.adjustmentRequests.create(dto)
    }

    @MmMutation(mmFeatures('inventory-control', 'adjustment-approval'))
    @Post('adjustment-requests/:id/approve')
    approveAdjRequest(@Param('id') id: string, @Body() dto: ApproveAdjustmentRequestDto) {
        return this.adjustmentRequests.approve(id, dto ?? {})
    }

    @MmMutation(mmFeatures('inventory-control', 'adjustment-approval'))
    @Post('adjustment-requests/:id/reject')
    rejectAdjRequest(@Param('id') id: string, @Body() dto: RejectAdjustmentRequestDto) {
        return this.adjustmentRequests.reject(id, dto ?? {})
    }

    @Get('count-sessions/:id/variances')
    @MmRead(READERS)
    listVariances(@Param('id') id: string) {
        return this.variances.listBySession(id)
    }

    // ── Legacy: Count rules ────────────────────────────────────────

    @Get('count-rules')
    @MmRead(READERS)
    listRules(@Query() query: CountRuleQueryDto) {
        return this.rules.findAll(query)
    }

    @Get('count-rules/:id')
    @MmRead(READERS)
    getRule(@Param('id') id: string) {
        return this.rules.findOne(id)
    }

    @MmMutation(mmFeatures('inventory-control', 'count-planning'))
    @Post('count-rules')
    createRule(@Body() dto: CreateCountRuleDto) {
        return this.rules.create(dto)
    }

    @Patch('count-rules/:id')
    @MmMutation(mmFeatures('inventory-control', 'count-planning'), 'update')
    updateRule(@Param('id') id: string, @Body() dto: UpdateCountRuleDto) {
        return this.rules.update(id, dto)
    }

    @Delete('count-rules/:id')
    @MmMutation(mmFeatures('inventory-control', 'count-planning'), 'delete')
    deleteRule(@Param('id') id: string) {
        return this.rules.remove(id)
    }

    // ── Legacy: Count lines ────────────────────────────────────────

    @Get('count-lines')
    @MmRead(READERS)
    listLines(@Query() query: CountLineQueryDto) {
        return this.counts.listLines(query)
    }

    @MmMutation(mmFeatures('inventory-control', 'blind-counting', 'count-sessions'))
    @Post('count-lines/:id/blind-count')
    blindCount(@Param('id') id: string, @Body() dto: BlindCountDto) {
        return this.counts.blindCount(id, dto)
    }

    @MmMutation(mmFeatures('inventory-control', 'recounts'))
    @Post('count-lines/:id/recount')
    recount(@Param('id') id: string, @Body() dto: RecountDto) {
        return this.counts.recount(id, dto)
    }

    // ── Legacy: Count sessions (MmInventoryCount) ──────────────────

    @Get('counts')
    @MmRead(READERS)
    listCounts(@Query() query: InventoryCountQueryDto) {
        return this.counts.findAll(query)
    }

    @Get('counts/:id')
    @MmRead(READERS)
    getCount(@Param('id') id: string, @Query('blind') blind?: string) {
        return this.counts.findOne(id, { blind: blind === 'true' || blind === '1' })
    }

    @MmMutation(mmFeatures('inventory-control', 'cycle-counting', 'physical-inventory', 'count-sessions'))
    @Post('counts')
    createCount(@Body() dto: CreateInventoryCountDto) {
        return this.counts.create(dto)
    }

    @MmMutation(mmFeatures('inventory-control', 'cycle-counting', 'physical-inventory', 'count-sessions'))
    @Post('counts/:id/generate')
    generate(@Param('id') id: string, @Body() dto: GenerateCountDto) {
        return this.counts.generate(id, dto ?? {})
    }

    @MmMutation(mmFeatures('inventory-control', 'cycle-counting', 'physical-inventory', 'count-sessions'))
    @Post('counts/:id/start')
    start(@Param('id') id: string) {
        return this.counts.start(id)
    }

    @MmMutation(mmFeatures('inventory-control', 'variance-analysis', 'cycle-counting', 'physical-inventory'))
    @Post('counts/:id/compute-variances')
    computeVariances(@Param('id') id: string) {
        return this.counts.computeVariances(id)
    }

    @MmMutation(mmFeatures('inventory-control', 'cycle-counting', 'physical-inventory', 'variance-analysis'))
    @Post('counts/:id/submit-approval')
    submitApproval(@Param('id') id: string) {
        return this.counts.submitApproval(id)
    }

    @MmMutation(mmFeatures('inventory-control', 'adjustment-approval'))
    @Post('counts/:id/approve')
    approve(@Param('id') id: string, @Body() dto: ApproveCountDto) {
        return this.counts.approve(id, dto ?? {})
    }

    @MmMutation(mmFeatures('inventory-control', 'adjustment-approval'))
    @Post('counts/:id/reject')
    reject(@Param('id') id: string, @Body() dto: RejectCountDto) {
        return this.counts.reject(id, dto ?? {})
    }

    @MmMutation(mmFeatures('inventory-control', 'adjustment-approval'))
    @Post('counts/:id/post-adjustments')
    postAdjustments(@Param('id') id: string, @Body() dto: ApproveCountDto) {
        return this.counts.postAdjustments(id, dto ?? {})
    }

    @MmMutation(mmFeatures('inventory-control', 'cycle-counting', 'physical-inventory', 'count-sessions'))
    @Post('counts/:id/close')
    close(@Param('id') id: string) {
        return this.counts.close(id)
    }
}
