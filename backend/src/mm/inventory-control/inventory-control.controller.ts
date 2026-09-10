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
import { CountRuleService } from './count-rule.service'
import { InventoryCountService } from './inventory-count.service'
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

@Controller('mm/inventory-control')
export class InventoryControlController {
    constructor(
        private rules: CountRuleService,
        private counts: InventoryCountService,
    ) {}

    // ── Count rules ────────────────────────────────────────────────

    @Get('count-rules')
    listRules(@Query() query: CountRuleQueryDto) {
        return this.rules.findAll(query)
    }

    @Get('count-rules/:id')
    getRule(@Param('id') id: string) {
        return this.rules.findOne(id)
    }

    @Post('count-rules')
    createRule(@Body() dto: CreateCountRuleDto) {
        return this.rules.create(dto)
    }

    @Patch('count-rules/:id')
    updateRule(@Param('id') id: string, @Body() dto: UpdateCountRuleDto) {
        return this.rules.update(id, dto)
    }

    @Delete('count-rules/:id')
    deleteRule(@Param('id') id: string) {
        return this.rules.remove(id)
    }

    // ── Count lines (blind / recount queues) ───────────────────────

    @Get('count-lines')
    listLines(@Query() query: CountLineQueryDto) {
        return this.counts.listLines(query)
    }

    @Post('count-lines/:id/blind-count')
    blindCount(@Param('id') id: string, @Body() dto: BlindCountDto) {
        return this.counts.blindCount(id, dto)
    }

    @Post('count-lines/:id/recount')
    recount(@Param('id') id: string, @Body() dto: RecountDto) {
        return this.counts.recount(id, dto)
    }

    // ── Count sessions ─────────────────────────────────────────────

    @Get('counts')
    listCounts(@Query() query: InventoryCountQueryDto) {
        return this.counts.findAll(query)
    }

    @Get('counts/:id')
    getCount(
        @Param('id') id: string,
        @Query('blind') blind?: string,
    ) {
        return this.counts.findOne(id, { blind: blind === 'true' || blind === '1' })
    }

    @Post('counts')
    createCount(@Body() dto: CreateInventoryCountDto) {
        return this.counts.create(dto)
    }

    @Post('counts/:id/generate')
    generate(@Param('id') id: string, @Body() dto: GenerateCountDto) {
        return this.counts.generate(id, dto ?? {})
    }

    @Post('counts/:id/start')
    start(@Param('id') id: string) {
        return this.counts.start(id)
    }

    @Post('counts/:id/compute-variances')
    computeVariances(@Param('id') id: string) {
        return this.counts.computeVariances(id)
    }

    @Post('counts/:id/submit-approval')
    submitApproval(@Param('id') id: string) {
        return this.counts.submitApproval(id)
    }

    @Post('counts/:id/approve')
    approve(@Param('id') id: string, @Body() dto: ApproveCountDto) {
        return this.counts.approve(id, dto ?? {})
    }

    @Post('counts/:id/reject')
    reject(@Param('id') id: string, @Body() dto: RejectCountDto) {
        return this.counts.reject(id, dto ?? {})
    }

    @Post('counts/:id/post-adjustments')
    postAdjustments(@Param('id') id: string, @Body() dto: ApproveCountDto) {
        return this.counts.postAdjustments(id, dto ?? {})
    }

    @Post('counts/:id/close')
    close(@Param('id') id: string) {
        return this.counts.close(id)
    }
}
