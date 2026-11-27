import { Module } from '@nestjs/common'
import { FINANCIAL_PERIOD_PORT } from '../mm/integration/fico/financial-period.port'
import { FicoAccountingConsumerService } from './fico-accounting-consumer.service'
import { FicoAccountingEventProcessorService } from './fico-accounting-event-processor.service'
import { FicoAccountingEventRecoveryService } from './fico-accounting-event-recovery.service'
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
import { FicoAccountDeterminationSimulationService } from './fico-account-determination-simulation.service'
import { FicoAccountDeterminationExceptionService } from './fico-account-determination-exception.service'
import { FicoDeterminationSodPolicy } from './fico-determination-sod.policy'
import { FicoAccountingEventsService } from './fico-accounting-events.service'
import { FicoAuditService } from './fico-audit.service'
import { FicoChartOfAccountsService } from './fico-chart-of-accounts.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { FicoCompanySettingsService } from './fico-company-settings.service'
import { FicoController } from './fico.controller'
import { FicoDocumentTypeController } from './fico-document-type.controller'
import { FicoDocumentTypeService } from './fico-document-type.service'
import { FicoFiDocumentTypeController } from './fico-fi-document-type.controller'
import { FicoFiDocumentTypeService } from './fico-fi-document-type.service'
import { FicoFiscalCalendarService } from './fico-fiscal-calendar.service'
import { FicoDocumentNumberingService } from './fico-document-numbering.service'
import { FicoFinancialPostingEngine } from './fico-financial-posting.engine'
import { FicoGeneralLedgerService } from './fico-general-ledger.service'
import { FicoGlAccountsService } from './fico-gl-accounts.service'
import { FicoJournalIntegrityService } from './fico-journal-integrity.service'
import { FicoJournalService } from './fico-journal.service'
import { FicoJournalDocumentFlowService } from './fico-journal-document-flow.service'
import { FicoApReconciliationGuardService } from './fico-ap-reconciliation-guard.service'
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
import { FicoAccountsPayableController } from './fico-accounts-payable.controller'
import { FicoAccountsPayableService } from './fico-accounts-payable.service'
import { FicoAccountsReceivableController } from './fico-accounts-receivable.controller'
import { FicoAccountsReceivableService } from './fico-accounts-receivable.service'
import { FicoGrIrController } from './fico-grir.controller'
import { FicoGrIrOpenItemListener } from './fico-grir-open-item.listener'
import { FicoArSalesInvoiceListener } from './fico-ar-sales-invoice.listener'
import { FicoArInvoicePaidListener } from './fico-ar-invoice-paid.listener'
import { FicoArSalesReturnListener } from './fico-ar-sales-return.listener'
import { FicoSdRevenueGuardService } from './fico-sd-revenue-guard.service'
import { FicoArCreditCheckService } from './fico-ar-credit-check.service'
import { FicoGrIrOpenItemService } from './fico-grir-open-item.service'
import { FicoGrIrWorkbenchService } from './fico-grir-workbench.service'
import { FicoFinancialPeriodAdapter } from './financial-period.adapter'
import { FicoFinancialPeriodService } from './financial-period.service'
import { FicoTreasuryController } from './fico-treasury.controller'
import { FicoTreasuryAccountService } from './fico-treasury-account.service'
import { FicoTreasurySettlementService } from './fico-treasury-settlement.service'
import { FicoTreasuryPaymentResolutionService } from './fico-treasury-payment-resolution.service'
import { FicoTaxPostingSnapshotService } from './fico-tax-posting-snapshot.service'
import { FicoTaxReconciliationService } from './fico-tax-reconciliation.service'

@Module({
    controllers: [
        FicoController,
        FicoPhase1Controller,
        FicoAccountDeterminationController,
        FicoNumberRangeController,
        FicoTaxCodeController,
        FicoDocumentTypeController,
        FicoFiDocumentTypeController,
        FicoAccountsPayableController,
        FicoAccountsReceivableController,
        FicoGrIrController,
        FicoTreasuryController,
    ],
    providers: [
        FicoFinancialPeriodService,
        FicoFinancialPeriodAdapter,
        FicoDocumentNumberingService,
        FicoFinancialPostingEngine,
        FicoJournalService,
        FicoJournalDocumentFlowService,
        FicoApReconciliationGuardService,
        FicoAccountsPayableService,
        FicoAccountsReceivableService,
        FicoGrIrOpenItemService,
        FicoGrIrWorkbenchService,
        FicoGrIrOpenItemListener,
        FicoArSalesInvoiceListener,
        FicoArInvoicePaidListener,
        FicoArSalesReturnListener,
        FicoSdRevenueGuardService,
        FicoArCreditCheckService,
        FicoTreasuryAccountService,
        FicoTreasurySettlementService,
        FicoTreasuryPaymentResolutionService,
        FicoTaxPostingSnapshotService,
        FicoTaxReconciliationService,
        FicoGeneralLedgerService,
        FicoJournalIntegrityService,
        FicoAccountDeterminationService,
        FicoAccountDeterminationRulesService,
        FicoAccountDeterminationValidationService,
        FicoMmMappingMigrationService,
        FicoAccountResolutionService,
        FicoAccountDeterminationSimulationService,
        FicoAccountDeterminationExceptionService,
        FicoDeterminationSodPolicy,
        FicoAccountMappingService,
        FicoTransactionKeyService,
        FicoAccountingEventsService,
        FicoAccountingConsumerService,
        FicoAccountingEventProcessorService,
        FicoAccountingEventRecoveryService,
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
        FicoFiDocumentTypeService,
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
        FicoAccountsPayableService,
        FicoAccountsReceivableService,
        FicoSdAccountingBridgeService,
        FicoSdRevenueGuardService,
        FicoArCreditCheckService,
        FicoTreasuryPaymentResolutionService,
        FicoAccountingEventProcessorService,
        FINANCIAL_PERIOD_PORT,
    ],
})
export class FicoModule {}
