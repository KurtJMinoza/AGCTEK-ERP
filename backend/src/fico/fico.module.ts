import { Module } from '@nestjs/common'
import { FINANCIAL_PERIOD_PORT } from '../mm/integration/fico/financial-period.port'
import { FicoAccountingConsumerService } from './fico-accounting-consumer.service'
import { FicoAccountDeterminationController } from './fico-account-determination.controller'
import { FicoAccountDeterminationRulesService } from './fico-account-determination-rules.service'
import { FicoAccountDeterminationService } from './fico-account-determination.service'
import { FicoAccountResolutionService } from './fico-account-resolution.service'
import { FicoAccountMappingService } from './fico-account-mapping.service'
import { FicoAccountingEventsService } from './fico-accounting-events.service'
import { FicoAuditService } from './fico-audit.service'
import { FicoChartOfAccountsService } from './fico-chart-of-accounts.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { FicoCompanySettingsService } from './fico-company-settings.service'
import { FicoController } from './fico.controller'
import { FicoDocumentTypeController } from './fico-document-type.controller'
import { FicoDocumentTypeService } from './fico-document-type.service'
import { FicoFiscalCalendarService } from './fico-fiscal-calendar.service'
import { FicoGlAccountsService } from './fico-gl-accounts.service'
import { FicoJournalService } from './fico-journal.service'
import { FicoSalesReturnRefundListener } from './fico-sales-return-refund.listener'
import { FicoSalesReturnRefundService } from './fico-sales-return-refund.service'
import { FicoNumberRangeController } from './fico-number-range.controller'
import { FicoNumberRangeService } from './fico-number-range.service'
import { FicoOverviewService } from './fico-overview.service'
import { FicoPhase1Controller } from './fico-phase1.controller'
import { FicoPostingPeriodService } from './fico-posting-period.service'
import { FicoPostingValidationService } from './fico-posting-validation.service'
import { FicoReconciliationService } from './fico-reconciliation.service'
import { FicoTaxCodeController } from './fico-tax-code.controller'
import { FicoTaxCalculationService } from './fico-tax-calculation.service'
import { FicoTaxCodeService } from './fico-tax-code.service'
import { FicoFinancialPeriodAdapter } from './financial-period.adapter'
import { FicoFinancialPeriodService } from './financial-period.service'
import { DocumentTypesController } from './document-types/document-types.controller'
import { DocumentTypesService } from './document-types/document-types.service'
import { JournalEntryService } from './journal-entries/journal-entry.service'

@Module({
    controllers: [
        FicoController,
        FicoPhase1Controller,
        FicoAccountDeterminationController,
        DocumentTypesController,
        // Manual-journal routes live on FicoPhase1Controller (main).
        // Do not also register JournalEntryController — duplicate Fastify routes.
        FicoNumberRangeController,
        FicoTaxCodeController,
        FicoDocumentTypeController,
    ],
    providers: [
        FicoFinancialPeriodService,
        FicoFinancialPeriodAdapter,
        FicoJournalService,
        FicoSalesReturnRefundService,
        FicoSalesReturnRefundListener,
        FicoAccountDeterminationService,
        FicoAccountDeterminationRulesService,
        FicoAccountResolutionService,
        FicoAccountMappingService,
        FicoAccountingEventsService,
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
        DocumentTypesService,
        JournalEntryService,
        FicoNumberRangeService,
        FicoTaxCalculationService,
        FicoTaxCodeService,
        FicoDocumentTypeService,
        {
            provide: FINANCIAL_PERIOD_PORT,
            useExisting: FicoFinancialPeriodAdapter,
        },
    ],
    exports: [
        FicoFinancialPeriodService,
        FicoFinancialPeriodAdapter,
        FicoJournalService,
        FicoSalesReturnRefundService,
        FicoAccountDeterminationService,
        FicoAccountDeterminationRulesService,
        FicoAccountResolutionService,
        FicoReconciliationService,
        FicoAuditService,
        FicoCompanyAccessService,
        FicoCompanySettingsService,
        FicoChartOfAccountsService,
        FicoGlAccountsService,
        FicoFiscalCalendarService,
        FicoPostingPeriodService,
        FicoPostingValidationService,
        FicoNumberRangeService,
        FicoTaxCalculationService,
        FicoTaxCodeService,
        FicoDocumentTypeService,
        FINANCIAL_PERIOD_PORT,
    ],
})
export class FicoModule {}
