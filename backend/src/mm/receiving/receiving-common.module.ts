import { Module, forwardRef } from '@nestjs/common'
import { ReceivingDocumentService } from './receiving-document.service'
import { ReceivingVarianceService } from './receiving-variance.service'
import { InspectionRequirementService } from './inspection-requirement.service'
import { InspectionLotService } from './inspection-lot.service'
import { QualityDecisionService } from './quality-decision.service'
import { QualityHoldService } from './quality-hold.service'
import { ReceivingController } from './receiving.controller'
import { InspectionLotController } from './inspection-lot.controller'
import { QualityHoldController } from './quality-hold.controller'

@Module({
    controllers: [ReceivingController, InspectionLotController, QualityHoldController],
    providers: [
        ReceivingDocumentService,
        ReceivingVarianceService,
        InspectionRequirementService,
        InspectionLotService,
        QualityDecisionService,
        QualityHoldService,
    ],
    exports: [
        ReceivingDocumentService,
        ReceivingVarianceService,
        InspectionRequirementService,
        InspectionLotService,
        QualityDecisionService,
        QualityHoldService,
    ],
})
export class ReceivingCommonModule {}
