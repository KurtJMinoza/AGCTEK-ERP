import { Module } from '@nestjs/common'
import { FINANCIAL_PERIOD_PORT } from '../mm/integration/fico/financial-period.port'
import { FicoAccountingConsumerService } from './fico-accounting-consumer.service'
import { FicoAccountDeterminationService } from './fico-account-determination.service'
import { FicoAuditService } from './fico-audit.service'
import { FicoChartOfAccountsService } from './fico-chart-of-accounts.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { FicoCompanySettingsService } from './fico-company-settings.service'
import { FicoController } from './fico.controller'
import { FicoFiscalCalendarService } from './fico-fiscal-calendar.service'
import { FicoGlAccountsService } from './fico-gl-accounts.service'
import { FicoJournalService } from './fico-journal.service'
import { FicoOverviewService } from './fico-overview.service'
import { FicoPhase1Controller } from './fico-phase1.controller'
import { FicoPostingPeriodService } from './fico-posting-period.service'
import { FicoPostingValidationService } from './fico-posting-validation.service'
import { FicoReconciliationService } from './fico-reconciliation.service'
import { FicoFinancialPeriodAdapter } from './financial-period.adapter'
import { FicoFinancialPeriodService } from './financial-period.service'

@Module({
    controllers: [FicoController, FicoPhase1Controller],
    providers: [
        FicoFinancialPeriodService,
        FicoFinancialPeriodAdapter,
        FicoJournalService,
        FicoAccountDeterminationService,
        FicoAccountingConsumerService,
        FicoReconciliationService,
        FicoAuditService,
        FicoCompanyAccessService,
        FicoCompanySettingsService,
        FicoChartOfAccountsService,
        FicoGlAccountsService,
        FicoFiscalCalendarService,
        FicoPostingPeriodService,
        FicoPostingValidationService,
        FicoOverviewService,
        {
            provide: FINANCIAL_PERIOD_PORT,
            useExisting: FicoFinancialPeriodAdapter,
        },
    ],
    exports: [
        FicoFinancialPeriodService,
        FicoFinancialPeriodAdapter,
        FicoJournalService,
        FicoAccountDeterminationService,
        FicoReconciliationService,
        FicoAuditService,
        FicoCompanyAccessService,
        FicoCompanySettingsService,
        FicoChartOfAccountsService,
        FicoGlAccountsService,
        FicoFiscalCalendarService,
        FicoPostingPeriodService,
        FicoPostingValidationService,
        FINANCIAL_PERIOD_PORT,
    ],
})
export class FicoModule {}
