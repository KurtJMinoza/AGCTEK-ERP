import {
    Body, Controller, Delete, Get, Param, Post, Put, Query,
    UsePipes, ValidationPipe,
} from '@nestjs/common'
import { InspectionLotService } from '../receiving/inspection-lot.service'
import { QualityHoldService } from '../receiving/quality-hold.service'
import { InspectionPlanService } from './inspection-plan.service'
import { DefectCodeService } from './defect-code.service'
import { InspectionLotLifecycleService } from './inspection-lot-lifecycle.service'
import { NonconformanceService } from './nonconformance.service'
import { CorrectiveActionService } from './corrective-action.service'
import { QualityReportingService } from './quality-reporting.service'
import { MmMutation } from '../common/mm-mutation.decorator'
import {
    CapaQueryDto,
    CompleteInspectionLotDto,
    CreateCorrectiveActionDto,
    CreateDefectCodeDto,
    CreateInspectionPlanDto,
    CreateNonconformanceDto,
    CreateQualityHoldDtoExtended,
    QualityQueryDto,
    ResolveNonconformanceDto,
    StartInspectionLotDto,
    TransitionCorrectiveActionDto,
    UpdateCorrectiveActionDto,
    UpdateInspectionPlanDto,
    UploadQualityAttachmentDto,
    UsageDecisionExtendedDto,
} from './dto/quality.dto'
import { QualityAttachmentService } from './quality-attachment.service'
import { QualityRuleService } from './quality-rule.service'
import { RecordInspectionResultsDto } from '../receiving/dto/receiving.dto'
import { ReleaseQualityHoldDto } from '../receiving/dto/receiving.dto'
import {
    CreateInspectionRuleDto,
    UpdateInspectionRuleDto,
} from './dto/quality.dto'

@Controller('mm/quality')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class QualityController {
    constructor(
        private plans: InspectionPlanService,
        private defectCodes: DefectCodeService,
        private lots: InspectionLotService,
        private lifecycle: InspectionLotLifecycleService,
        private holds: QualityHoldService,
        private nc: NonconformanceService,
        private capa: CorrectiveActionService,
        private reporting: QualityReportingService,
        private attachments: QualityAttachmentService,
        private inspectionRules: QualityRuleService,
    ) {}

    @Get('dashboard')
    dashboard(@Query() query: QualityQueryDto) {
        return this.reporting.getDashboard(query)
    }

    @Get('usage-decisions')
    listDecisions(@Query() query: QualityQueryDto) {
        return this.reporting.listDecisions(query)
    }

    // ── Inspection plans ──
    @Get('inspection-plans')
    listPlans(@Query() query: QualityQueryDto) {
        return this.plans.findAll(query)
    }

    @Get('inspection-plans/:id')
    getPlan(@Param('id') id: string) {
        return this.plans.findOne(id)
    }

    @Post('inspection-plans')
    @MmMutation()
    createPlan(@Body() dto: CreateInspectionPlanDto) {
        return this.plans.create(dto)
    }

    @Put('inspection-plans/:id')
    @MmMutation()
    updatePlan(@Param('id') id: string, @Body() dto: UpdateInspectionPlanDto) {
        return this.plans.update(id, dto)
    }

    @Delete('inspection-plans/:id')
    @MmMutation()
    removePlan(@Param('id') id: string) {
        return this.plans.remove(id)
    }

    // ── Inspection rules ──
    @Get('inspection-rules')
    listInspectionRules(@Query() query: QualityQueryDto) {
        return this.inspectionRules.findAll(query)
    }

    @Get('inspection-rules/:id')
    getInspectionRule(@Param('id') id: string) {
        return this.inspectionRules.findOne(id)
    }

    @Post('inspection-rules')
    @MmMutation()
    createInspectionRule(@Body() dto: CreateInspectionRuleDto) {
        return this.inspectionRules.create(dto)
    }

    @Put('inspection-rules/:id')
    @MmMutation()
    updateInspectionRule(@Param('id') id: string, @Body() dto: UpdateInspectionRuleDto) {
        return this.inspectionRules.update(id, dto)
    }

    @Delete('inspection-rules/:id')
    @MmMutation()
    removeInspectionRule(@Param('id') id: string) {
        return this.inspectionRules.remove(id)
    }

    @Post('inspection-rules/seed-legacy/:companyId')
    @MmMutation()
    seedLegacyInspectionRules(@Param('companyId') companyId: string) {
        return this.inspectionRules.seedLegacyFlags(companyId)
    }

    // ── Defect codes ──
    @Get('defect-codes')
    listDefectCodes(@Query() query: QualityQueryDto) {
        return this.defectCodes.findAll(query)
    }

    @Post('defect-codes')
    @MmMutation()
    createDefectCode(@Body() dto: CreateDefectCodeDto) {
        return this.defectCodes.create(dto)
    }

    @Post('defect-codes/seed/:companyId')
    @MmMutation()
    seedDefectCodes(@Param('companyId') companyId: string) {
        return this.defectCodes.seedDefaults(companyId)
    }

    // ── Inspection lots ──
    @Get('inspection-lots')
    listLots(@Query() query: QualityQueryDto) {
        return this.lots.findAll(query)
    }

    @Get('inspection-lots/:id')
    getLot(@Param('id') id: string) {
        return this.lots.findOne(id)
    }

    @Post('inspection-lots/:id/start')
    @MmMutation()
    startLot(@Param('id') id: string, @Body() dto: StartInspectionLotDto) {
        return this.lifecycle.start(id, dto)
    }

    @Post('inspection-lots/:id/results')
    @MmMutation()
    recordResults(@Param('id') id: string, @Body() dto: RecordInspectionResultsDto) {
        return this.lots.recordResults(id, dto)
    }

    @Post('inspection-lots/:id/complete')
    @MmMutation()
    completeLot(@Param('id') id: string, @Body() dto: CompleteInspectionLotDto) {
        return this.lifecycle.complete(id, dto)
    }

    @Post('inspection-lots/:id/usage-decision')
    @MmMutation()
    usageDecision(@Param('id') id: string, @Body() dto: UsageDecisionExtendedDto) {
        return this.lots.usageDecision(id, dto)
    }

    // ── Holds ──
    @Post('holds')
    @MmMutation()
    createHold(@Body() dto: CreateQualityHoldDtoExtended) {
        return this.holds.create(dto)
    }

    @Get('holds')
    listHolds(@Query() query: QualityQueryDto) {
        return this.holds.findAll(query)
    }

    @Post('holds/:id/release')
    @MmMutation()
    releaseHold(@Param('id') id: string, @Body() dto: ReleaseQualityHoldDto) {
        return this.holds.release(id, dto)
    }

    // ── Nonconformances ──
    @Get('nonconformances')
    listNc(@Query() query: QualityQueryDto) {
        return this.nc.findAll(query)
    }

    @Get('nonconformances/:id')
    getNc(@Param('id') id: string) {
        return this.nc.findOne(id)
    }

    @Post('nonconformances')
    @MmMutation()
    createNc(@Body() dto: CreateNonconformanceDto) {
        return this.nc.create(dto)
    }

    @Post('nonconformances/:id/resolve')
    @MmMutation()
    resolveNc(@Param('id') id: string, @Body() dto: ResolveNonconformanceDto) {
        return this.nc.resolve(id, dto)
    }

    @Get('nonconformances/:id/corrective-actions')
    listCapa(@Param('id') id: string) {
        return this.capa.listForNc(id)
    }

    @Post('nonconformances/:id/corrective-actions')
    @MmMutation()
    createCapa(@Param('id') id: string, @Body() dto: CreateCorrectiveActionDto) {
        return this.capa.create(id, dto)
    }

    // ── Corrective Actions (top-level) ──
    @Get('corrective-actions')
    listAllCapa(@Query() query: CapaQueryDto) {
        return this.capa.list(query)
    }

    @Get('corrective-actions/:id')
    getCapaById(@Param('id') id: string) {
        return this.capa.findOne(id)
    }

    @Put('corrective-actions/:id')
    @MmMutation()
    updateCapa(@Param('id') id: string, @Body() dto: UpdateCorrectiveActionDto) {
        return this.capa.update(id, dto)
    }

    @Post('corrective-actions/:id/transition')
    @MmMutation()
    transitionCapa(@Param('id') id: string, @Body() dto: TransitionCorrectiveActionDto) {
        return this.capa.transition(id, dto)
    }

    // ── Attachments ──
    @Get('attachments')
    listAttachments(
        @Query('entityType') entityType: string,
        @Query('entityId') entityId: string,
    ) {
        return this.attachments.list(entityType, entityId)
    }

    @Post('attachments')
    @MmMutation()
    uploadAttachment(@Body() dto: UploadQualityAttachmentDto) {
        const buffer = Buffer.from(dto.contentBase64, 'base64')
        return this.attachments.save({
            companyId: dto.companyId,
            entityType: dto.entityType,
            entityId: dto.entityId,
            fileName: dto.fileName,
            buffer,
            mimeType: dto.mimeType,
            uploadedBy: dto.uploadedBy,
        })
    }

    @Delete('attachments/:id')
    @MmMutation()
    removeAttachment(@Param('id') id: string) {
        return this.attachments.remove(id)
    }
}
