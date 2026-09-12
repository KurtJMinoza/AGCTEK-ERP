import { Module } from '@nestjs/common'
import { ProcurementBudgetService } from './procurement-budget.service'
import { PurchaseCommitmentService } from './purchase-commitment.service'

@Module({
    providers: [ProcurementBudgetService, PurchaseCommitmentService],
    exports: [ProcurementBudgetService, PurchaseCommitmentService],
})
export class ProcurementCommonModule {}
