import { Module } from '@nestjs/common'
import { FINANCIAL_PERIOD_PORT } from '../mm/integration/fico/financial-period.port'
import { FicoAccountingConsumerService } from './fico-accounting-consumer.service'
import { FicoAccountingEventProcessorService } from './fico-accounting-event-processor.service'
import { FicoSdAccountingBridgeService } from './fico-sd-accounting-bridge.service'
import { FicoSdPostingService } from './fico-sd-posting.service'
import { FicoAccountDeterminationController } from './fico-account-determination.controller'
import { FicoAccountDeterminationRulesService } from './fico-account-determination-rules.service'
import { FicoAccountDeterminationValidationService } from './fico-account-determination-validation.service'
import { FicoMmMappingMigrationService } from './fico-mm-mapping-migration.service'
import { FicoAccountDeterminationService } from './fico-account-determination.service'
import { FicoAccountResolutionService } from './fico-account-resolution.service'
import { FicoAccountMappingService } from './fico-account-mapping.service'
import { FicoTransactionKeyService } from './fico-transaction-key.service'
import { FicoAccountingEventsService } from './fico-accounting-events.service'
import { FicoAuditService } from './fico-audit.service'
import { FicoChartOfAccountsService } from './fico-chart-of-accounts.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { FicoCompanySettingsService } from './fico-company-settings.service'
import { FicoController } from './fico.controller'
import { FicoDocumentTypeController } from './fico-document-type.controller'
import { FicoDocumentTypeService } from './fico-document-type.service'
import { FicoFiscalCalendarService } from './fico-fiscal-calendar.service'
import { FicoDocumentNumberingService } from './fico-document-numbering.service'
import { FicoFinancialPostingEngine } from './fico-financial-posting.engine'
import { FicoGeneralLedgerService } from './fico-general-ledger.service'
import { FicoGlAccountsService } from './fico-gl-accounts.service'
import { FicoJournalIntegrityService } from './fico-journal-integrity.service'
import { FicoJournalService } from './fico-journal.service'
import { FicoNumberRangeController } from './fico-number-range.controller'
import { FicoNumberRangeService } from './fico-number-range.service'
import { FicoOverviewService } from './fico-overview.service'
import { FicoPhase1Controller } from './fico-phase1.controller'
import { FicoPostingPeriodService } from './fico-posting-period.service'
import { FicoPostingValidationService } from './fico-posting-validation.service'
import { FicoAccountingReconciliationService } from './fico-accounting-reconciliation.service'
import { FicoOpeningBalanceService } from './fico-opening-balance.service'
import { FicoPeriodClosingService } from './fico-period-closing.service'
import { FicoYearEndClosingService } from './fico-year-end-closing.service'
import { FicoReconciliationService } from './fico-reconciliation.service'
import { FicoTaxCodeController } from './fico-tax-code.controller'
import { FicoTaxCalculationService } from './fico-tax-calculation.service'
import { FicoTaxCodeService } from './fico-tax-code.service'
import { FicoFinancialPeriodAdapter } from './financial-period.adapter'
import { FicoFinancialPeriodService } from './financial-period.service'

@Module({
    controllers: [
        FicoController,
        FicoPhase1Controller,
        FicoAccountDeterminationController,
        FicoNumberRangeController,
        FicoTaxCodeController,
        FicoDocumentTypeController,
    ],
    providers: [
        FicoFinancialPeriodService,
        FicoFinancialPeriodAdapter,
        FicoDocumentNumberingService,
        FicoFinancialPostingEngine,
        FicoJournalService,
        FicoGeneralLedgerService,
        FicoJournalIntegrityService,
        FicoAccountDeterminationService,
        FicoAccountDeterminationRulesService,
        FicoAccountDeterminationValidationService,
        FicoMmMappingMigrationService,
        FicoAccountResolutionService,
        FicoAccountMappingService,
        FicoTransactionKeyService,
        FicoAccountingEventsService,
        FicoAccountingConsumerService,
        FicoAccountingEventProcessorService,
        FicoSdPostingService,
        FicoSdAccountingBridgeService,
        FicoReconciliationService,
        FicoAccountingReconciliationService,
        FicoOpeningBalanceService,
        FicoPeriodClosingService,
        FicoYearEndClosingService,
        FicoAuditService,
        FicoCompanyAccessService,
        FicoCompanySettingsService,
        FicoChartOfAccountsService,
        FicoGlAccountsService,
        FicoFiscalCalendarService,
        FicoPostingPeriodService,
        FicoPostingValidationService,
        FicoOverviewService,
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
        FicoDocumentNumberingService,
        FicoFinancialPostingEngine,
        FicoJournalService,
        FicoGeneralLedgerService,
        FicoJournalIntegrityService,
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
        FicoSdAccountingBridgeService,
        FINANCIAL_PERIOD_PORT,
    ],
})
export class FicoModule {}
