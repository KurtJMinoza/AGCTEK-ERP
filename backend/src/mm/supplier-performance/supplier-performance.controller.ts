import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Query,
    Body,
    BadRequestException,
} from '@nestjs/common'
import { SupplierScoreConfigService } from './supplier-score-config.service'
import { SupplierEvaluationService } from './supplier-evaluation.service'
import { SupplierAlertService } from './supplier-alert.service'
import { SupplierPerformanceDashboardService } from './supplier-performance-dashboard.service'
import { SupplierManualAssessmentService } from './supplier-manual-assessment.service'
import {
    UpsertWeightConfigDto,
    UpsertAlertConfigDto,
    RunEvaluationDto,
    EvaluationQueryDto,
    DashboardQueryDto,
    TrendsQueryDto,
    AlertQueryDto,
    CompareQueryDto,
    SupplierDetailQueryDto,
    CreateManualAssessmentDto,
    ManualAssessmentQueryDto,
} from './dto/supplier-performance.dto'

@Controller('mm/supplier-performance')
export class SupplierPerformanceController {
    constructor(
        private config: SupplierScoreConfigService,
        private evaluations: SupplierEvaluationService,
        private alerts: SupplierAlertService,
        private dashboard: SupplierPerformanceDashboardService,
        private manual: SupplierManualAssessmentService,
    ) {}

    @Get('weight-config')
    getWeights(@Query('companyId') companyId: string) {
        return this.config.getWeights(companyId)
    }

    @Patch('weight-config')
    upsertWeights(@Body() dto: UpsertWeightConfigDto) {
        return this.config.upsertWeights(dto)
    }

    @Get('alert-config')
    getAlertConfig(@Query('companyId') companyId: string) {
        return this.config.getAlertConfig(companyId)
    }

    @Patch('alert-config')
    upsertAlertConfig(@Body() dto: UpsertAlertConfigDto) {
        return this.config.upsertAlertConfig(dto)
    }

    @Post('evaluations/run')
    run(@Body() dto: RunEvaluationDto) {
        return this.evaluations.run(dto)
    }

    @Get('evaluations')
    listEvaluations(@Query() query: EvaluationQueryDto) {
        return this.evaluations.findAll(query)
    }

    @Get('evaluations/:id')
    getEvaluation(@Param('id') id: string) {
        return this.evaluations.findOne(id)
    }

    @Get('dashboard')
    getDashboard(@Query() query: DashboardQueryDto) {
        return this.dashboard.getDashboard(query)
    }

    @Get('trends')
    getTrends(@Query() query: TrendsQueryDto) {
        return this.evaluations.trends(query)
    }

    @Get('compare')
    compare(@Query() query: CompareQueryDto) {
        const supplierIds = String(query.supplierIds || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        if (supplierIds.length < 2) {
            throw new BadRequestException(
                'Provide at least two supplierIds (comma-separated)',
            )
        }
        return this.evaluations.compare({
            companyId: query.companyId,
            supplierIds,
            periodStart: query.periodStart,
            periodEnd: query.periodEnd,
        })
    }

    @Get('suppliers/:supplierId/detail')
    supplierDetail(
        @Param('supplierId') supplierId: string,
        @Query() query: SupplierDetailQueryDto,
    ) {
        return this.evaluations.getSupplierDetail(
            supplierId,
            query.companyId,
            query.limit ?? 20,
        )
    }

    @Get('alerts')
    listAlerts(@Query() query: AlertQueryDto) {
        return this.alerts.findAll(query)
    }

    @Post('alerts/:id/acknowledge')
    acknowledge(@Param('id') id: string) {
        return this.alerts.acknowledge(id)
    }

    @Post('alerts/:id/dismiss')
    dismiss(@Param('id') id: string) {
        return this.alerts.dismiss(id)
    }

    @Get('manual-assessments')
    listManual(@Query() query: ManualAssessmentQueryDto) {
        return this.manual.findAll(query)
    }

    @Post('manual-assessments')
    createManual(@Body() dto: CreateManualAssessmentDto) {
        return this.manual.create(dto)
    }

    @Post('manual-assessments/:id/submit')
    submitManual(@Param('id') id: string) {
        return this.manual.submit(id)
    }

    @Post('manual-assessments/:id/approve')
    approveManual(@Param('id') id: string) {
        return this.manual.approve(id)
    }

    @Post('manual-assessments/:id/cancel')
    cancelManual(@Param('id') id: string) {
        return this.manual.cancel(id)
    }
}
