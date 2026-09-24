import { Module } from '@nestjs/common'
import { InspectionPlanService } from './inspection-plan.service'
import { DefectCodeService } from './defect-code.service'
import { SamplingService } from './sampling.service'
import { InspectionLotLifecycleService } from './inspection-lot-lifecycle.service'
import { NonconformanceService } from './nonconformance.service'
import { CorrectiveActionService } from './corrective-action.service'
import { QualityAttachmentService } from './quality-attachment.service'
import { QualityWorkflowService } from './quality-workflow.service'
import { QualityReportingService } from './quality-reporting.service'
import { QualityRuleService } from './quality-rule.service'
import { QualityMetricsService } from './quality-metrics.service'

@Module({
    providers: [
        InspectionPlanService,
        DefectCodeService,
        SamplingService,
        InspectionLotLifecycleService,
        NonconformanceService,
        CorrectiveActionService,
        QualityAttachmentService,
        QualityWorkflowService,
        QualityReportingService,
        QualityRuleService,
        QualityMetricsService,
    ],
    exports: [
        InspectionPlanService,
        DefectCodeService,
        SamplingService,
        InspectionLotLifecycleService,
        NonconformanceService,
        CorrectiveActionService,
        QualityAttachmentService,
        QualityWorkflowService,
        QualityReportingService,
        QualityRuleService,
        QualityMetricsService,
    ],
})
export class QualityCommonModule {}
