import { Module } from '@nestjs/common'
import { FINANCIAL_PERIOD_PORT } from '../mm/integration/fico/financial-period.port'
import { FicoAccountingConsumerService } from './fico-accounting-consumer.service'
import { FicoController } from './fico.controller'
import { FicoJournalService } from './fico-journal.service'
import { FicoReconciliationService } from './fico-reconciliation.service'
import { FicoFinancialPeriodAdapter } from './financial-period.adapter'
import { FicoFinancialPeriodService } from './financial-period.service'

@Module({
    controllers: [FicoController],
    providers: [
        FicoFinancialPeriodService,
        FicoFinancialPeriodAdapter,
        FicoJournalService,
        FicoAccountingConsumerService,
        FicoReconciliationService,
        {
            provide: FINANCIAL_PERIOD_PORT,
            useExisting: FicoFinancialPeriodAdapter,
        },
    ],
    exports: [
        FicoFinancialPeriodService,
        FicoFinancialPeriodAdapter,
        FicoJournalService,
        FicoReconciliationService,
        FINANCIAL_PERIOD_PORT,
    ],
})
export class FicoModule {}
