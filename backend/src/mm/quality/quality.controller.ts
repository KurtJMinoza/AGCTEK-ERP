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
import { mmFeatures } from '../../permissions/permissions.constants'
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
    @MmMutation(mmFeatures('receiving', 'inspection-plans'))
    createPlan(@Body() dto: CreateInspectionPlanDto) {
        return this.plans.create(dto)
    }

    @Put('inspection-plans/:id')
    @MmMutation(mmFeatures('receiving', 'inspection-plans'))
    updatePlan(@Param('id') id: string, @Body() dto: UpdateInspectionPlanDto) {
        return this.plans.update(id, dto)
    }

    @Delete('inspection-plans/:id')
    @MmMutation(mmFeatures('receiving', 'inspection-plans'))
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
    @MmMutation(mmFeatures('receiving', 'inspection-rules'))
    createInspectionRule(@Body() dto: CreateInspectionRuleDto) {
        return this.inspectionRules.create(dto)
    }

    @Put('inspection-rules/:id')
    @MmMutation(mmFeatures('receiving', 'inspection-rules'))
    updateInspectionRule(@Param('id') id: string, @Body() dto: UpdateInspectionRuleDto) {
        return this.inspectionRules.update(id, dto)
    }

    @Delete('inspection-rules/:id')
    @MmMutation(mmFeatures('receiving', 'inspection-rules'))
    removeInspectionRule(@Param('id') id: string) {
        return this.inspectionRules.remove(id)
    }

    @Post('inspection-rules/seed-legacy/:companyId')
    @MmMutation(mmFeatures('receiving', 'inspection-rules'))
    seedLegacyInspectionRules(@Param('companyId') companyId: string) {
        return this.inspectionRules.seedLegacyFlags(companyId)
    }

    // ── Defect codes ──
    @Get('defect-codes')
    listDefectCodes(@Query() query: QualityQueryDto) {
        return this.defectCodes.findAll(query)
    }

    @Post('defect-codes')
    @MmMutation(mmFeatures('receiving', 'defect-codes'))
    createDefectCode(@Body() dto: CreateDefectCodeDto) {
        return this.defectCodes.create(dto)
    }

    @Post('defect-codes/seed/:companyId')
    @MmMutation(mmFeatures('receiving', 'defect-codes'))
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
    @MmMutation(mmFeatures('receiving', 'inspection-queue', 'receiving-inspection'))
    startLot(@Param('id') id: string, @Body() dto: StartInspectionLotDto) {
        return this.lifecycle.start(id, dto)
    }

    @Post('inspection-lots/:id/results')
    @MmMutation(mmFeatures('receiving', 'inspection-queue', 'receiving-inspection'))
    recordResults(@Param('id') id: string, @Body() dto: RecordInspectionResultsDto) {
        return this.lots.recordResults(id, dto)
    }

    @Post('inspection-lots/:id/complete')
    @MmMutation(mmFeatures('receiving', 'inspection-queue', 'receiving-inspection'))
    completeLot(@Param('id') id: string, @Body() dto: CompleteInspectionLotDto) {
        return this.lifecycle.complete(id, dto)
    }

    @Post('inspection-lots/:id/usage-decision')
    @MmMutation(mmFeatures('receiving', 'usage-decisions', 'inspection-queue', 'receiving-inspection'))
    usageDecision(@Param('id') id: string, @Body() dto: UsageDecisionExtendedDto) {
        return this.lots.usageDecision(id, dto)
    }

    // ── Holds ──
    @Post('holds')
    @MmMutation(mmFeatures('receiving', 'quality-holds', 'quality-quarantine'))
    createHold(@Body() dto: CreateQualityHoldDtoExtended) {
        return this.holds.create(dto)
    }

    @Get('holds')
    listHolds(@Query() query: QualityQueryDto) {
        return this.holds.findAll(query)
    }

    @Post('holds/:id/release')
    @MmMutation(mmFeatures('receiving', 'quality-holds', 'quality-quarantine'))
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
    @MmMutation(mmFeatures('receiving', 'nonconformances'))
    createNc(@Body() dto: CreateNonconformanceDto) {
        return this.nc.create(dto)
    }

    @Post('nonconformances/:id/resolve')
    @MmMutation(mmFeatures('receiving', 'nonconformances'))
    resolveNc(@Param('id') id: string, @Body() dto: ResolveNonconformanceDto) {
        return this.nc.resolve(id, dto)
    }

    @Get('nonconformances/:id/corrective-actions')
    listCapa(@Param('id') id: string) {
        return this.capa.listForNc(id)
    }

    @Post('nonconformances/:id/corrective-actions')
    @MmMutation(mmFeatures('receiving', 'nonconformances'))
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
    @MmMutation(mmFeatures('receiving', 'nonconformances'))
    updateCapa(@Param('id') id: string, @Body() dto: UpdateCorrectiveActionDto) {
        return this.capa.update(id, dto)
    }

    @Post('corrective-actions/:id/transition')
    @MmMutation(mmFeatures('receiving', 'nonconformances'))
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
    @MmMutation(mmFeatures('receiving', 'nonconformances', 'inspection-queue', 'receiving-inspection'))
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
    @MmMutation(mmFeatures('receiving', 'nonconformances', 'inspection-queue', 'receiving-inspection'))
    removeAttachment(@Param('id') id: string) {
        return this.attachments.remove(id)
    }
}
