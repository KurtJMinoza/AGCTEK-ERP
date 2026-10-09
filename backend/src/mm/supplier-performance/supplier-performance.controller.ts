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
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = [...mmFeatures('reports-analytics', 'supplier-performance-reports'), ...mmFeatures('supplier-management', 'supplier-evaluation', 'supplier-performance')]

@Controller('mm/supplier-performance')
export class SupplierPerformanceController {
    constructor(
        private config: SupplierScoreConfigService,
        private evaluations: SupplierEvaluationService,
        private alerts: SupplierAlertService,
        private dashboard: SupplierPerformanceDashboardService,
        private manual: SupplierManualAssessmentService,
    ) {}

    /** Canonical list/rankings alias — same payload as dashboard. */
    @Get()
    @MmRead(READERS)
    listPerformance(@Query() query: DashboardQueryDto) {
        return this.dashboard.getDashboard(query)
    }

    @Get('weight-config')
    @MmRead(READERS)
    getWeights(@Query('companyId') companyId: string) {
        return this.config.getWeights(companyId)
    }

    @Patch('weight-config')
    @MmMutation(mmFeatures('supplier-management', 'supplier-performance'), 'update')
    upsertWeights(@Body() dto: UpsertWeightConfigDto) {
        return this.config.upsertWeights(dto)
    }

    @Get('alert-config')
    @MmRead(READERS)
    getAlertConfig(@Query('companyId') companyId: string) {
        return this.config.getAlertConfig(companyId)
    }

    @Patch('alert-config')
    @MmMutation(mmFeatures('supplier-management', 'supplier-performance'), 'update')
    upsertAlertConfig(@Body() dto: UpsertAlertConfigDto) {
        return this.config.upsertAlertConfig(dto)
    }

    @Post('evaluations/run')
    @MmMutation(mmFeatures('supplier-management', 'supplier-performance'), 'create')
    run(@Body() dto: RunEvaluationDto) {
        return this.evaluations.run(dto)
    }

    @Get('evaluations')
    @MmRead(READERS)
    listEvaluations(@Query() query: EvaluationQueryDto) {
        return this.evaluations.findAll(query)
    }

    @Get('evaluations/:id')
    @MmRead(READERS)
    getEvaluation(@Param('id') id: string) {
        return this.evaluations.findOne(id)
    }

    @Get('dashboard')
    @MmRead(READERS)
    getDashboard(@Query() query: DashboardQueryDto) {
        return this.dashboard.getDashboard(query)
    }

    @Get('trends')
    @MmRead(READERS)
    getTrends(@Query() query: TrendsQueryDto) {
        return this.evaluations.trends(query)
    }

    @Get('compare')
    @MmRead(READERS)
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
    @MmRead(READERS)
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
    @MmRead(READERS)
    listAlerts(@Query() query: AlertQueryDto) {
        return this.alerts.findAll(query)
    }

    @Post('alerts/:id/acknowledge')
    @MmMutation(mmFeatures('supplier-management', 'supplier-performance'), 'update')
    acknowledge(@Param('id') id: string) {
        return this.alerts.acknowledge(id)
    }

    @Post('alerts/:id/dismiss')
    @MmMutation(mmFeatures('supplier-management', 'supplier-performance'), 'update')
    dismiss(@Param('id') id: string) {
        return this.alerts.dismiss(id)
    }

    @Get('manual-assessments')
    @MmRead(READERS)
    listManual(@Query() query: ManualAssessmentQueryDto) {
        return this.manual.findAll(query)
    }

    @Post('manual-assessments')
    @MmMutation(mmFeatures('supplier-management', 'supplier-evaluation'), 'create')
    createManual(@Body() dto: CreateManualAssessmentDto) {
        return this.manual.create(dto)
    }

    @Post('manual-assessments/:id/submit')
    @MmMutation(mmFeatures('supplier-management', 'supplier-evaluation'), 'update')
    submitManual(@Param('id') id: string) {
        return this.manual.submit(id)
    }

    @Post('manual-assessments/:id/approve')
    @MmMutation(mmFeatures('supplier-management', 'supplier-evaluation'), 'update')
    approveManual(@Param('id') id: string) {
        return this.manual.approve(id)
    }

    @Post('manual-assessments/:id/cancel')
    @MmMutation(mmFeatures('supplier-management', 'supplier-evaluation'), 'update')
    cancelManual(@Param('id') id: string) {
        return this.manual.cancel(id)
    }

    /** Canonical supplier detail alias — must be last among GETs. */
    @Get(':supplierId')
    @MmRead(READERS)
    supplierPerformanceDetail(
        @Param('supplierId') supplierId: string,
        @Query() query: SupplierDetailQueryDto,
    ) {
        return this.evaluations.getSupplierDetail(
            supplierId,
            query.companyId,
            query.limit ?? 20,
        )
    }
}
