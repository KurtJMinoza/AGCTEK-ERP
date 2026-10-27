-- FICO Phase 1 foundation.
-- Additive only: existing FICO journal rows and accounting events are preserved.
-- Unrelated repository schema drift is intentionally excluded.

-- Extend fiscal periods.
ALTER TABLE "fico_financial_periods"
    ADD COLUMN     "closeChecklist" JSONB,
    ADD COLUMN     "closedAt" TIMESTAMP(3),
    ADD COLUMN     "closedBy" TEXT,
    ADD COLUMN     "createdBy" TEXT,
    ADD COLUMN     "fiscalYearVariantId" TEXT,
    ADD COLUMN     "isYearEndAdjustment" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN     "lockedAt" TIMESTAMP(3),
    ADD COLUMN     "lockedBy" TEXT,
    ADD COLUMN     "name" TEXT NOT NULL DEFAULT '',
    ADD COLUMN     "openedAt" TIMESTAMP(3),
    ADD COLUMN     "openedBy" TEXT,
    ADD COLUMN     "periodType" TEXT NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN     "restrictedAt" TIMESTAMP(3),
    ADD COLUMN     "restrictedBy" TEXT,
    ADD COLUMN     "statusReason" TEXT,
    ADD COLUMN     "updatedBy" TEXT,
    ALTER COLUMN "status" SET DEFAULT 'FUTURE';

-- Extend journal headers. Legacy rows keep their original values and are marked LEGACY below.
ALTER TABLE "fico_journal_entries"
    ADD COLUMN     "createdBy" TEXT,
    ADD COLUMN     "description" TEXT,
    ADD COLUMN     "documentDate" DATE,
    ADD COLUMN     "documentNumber" TEXT,
    ADD COLUMN     "documentType" TEXT NOT NULL DEFAULT 'JOURNAL',
    ADD COLUMN     "exchangeRate" DECIMAL(18,6),
    ADD COLUMN     "fiscalPeriodId" TEXT,
    ADD COLUMN     "fiscalYear" INTEGER,
    ADD COLUMN     "postedAt" TIMESTAMP(3),
    ADD COLUMN     "postedBy" TEXT,
    ADD COLUMN     "reversalOfId" TEXT,
    ADD COLUMN     "sourceDocumentId" TEXT,
    ADD COLUMN     "sourceDocumentType" TEXT,
    ADD COLUMN     "sourceModule" TEXT,
    ADD COLUMN     "sourcePostingKey" TEXT,
    ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing header-only journals are retained for traceability but excluded from new G/L balances.
UPDATE "fico_journal_entries"
SET
    "documentNumber" = 'LEGACY-' || "id",
    "documentType" = 'LEGACY',
    "documentDate" = "postingDate",
    "fiscalYear" = EXTRACT(YEAR FROM "postingDate")::int,
    "description" = COALESCE("description", 'Legacy FICO journal stub (header only)'),
    "sourceModule" = COALESCE("sourceModule", 'LEGACY'),
    "status" = 'LEGACY',
    "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"legacy":true,"headerOnly":true}'::jsonb
WHERE "documentNumber" IS NULL;

CREATE TABLE "fico_company_accounting_settings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL DEFAULT '',
    "baseCurrency" VARCHAR(3) NOT NULL DEFAULT 'PHP',
    "countryCode" VARCHAR(2) NOT NULL DEFAULT 'PH',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
    "accountingMethod" TEXT NOT NULL DEFAULT 'ACCRUAL',
    "chartOfAccountsId" TEXT,
    "fiscalYearVariantId" TEXT,
    "postingPeriodVariantId" TEXT,
    "accountDeterminationProfileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "taxCountryCode" VARCHAR(2),
    "taxRegistrationNumber" TEXT,
    "taxJurisdiction" TEXT,
    "defaultTaxCode" TEXT,
    "documentNumberPrefix" TEXT NOT NULL DEFAULT 'JE',
    "documentNumberPadding" INTEGER NOT NULL DEFAULT 6,
    "closeChecklist" JSONB,
    "activatedAt" TIMESTAMP(3),
    "activatedBy" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedBy" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_company_accounting_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_charts_of_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "countryCode" VARCHAR(2) NOT NULL DEFAULT 'PH',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_charts_of_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_gl_account_groups" (
    "id" TEXT NOT NULL,
    "chartOfAccountsId" TEXT NOT NULL,
    "parentGroupId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_gl_account_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_gl_accounts" (
    "id" TEXT NOT NULL,
    "chartOfAccountsId" TEXT NOT NULL,
    "accountGroupId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "accountType" TEXT NOT NULL,
    "normalBalance" TEXT NOT NULL,
    "isPostingAccount" BOOLEAN NOT NULL DEFAULT true,
    "allowManualPosting" BOOLEAN NOT NULL DEFAULT true,
    "allowAutomaticPosting" BOOLEAN NOT NULL DEFAULT true,
    "isReconciliationAccount" BOOLEAN NOT NULL DEFAULT false,
    "reconciliationType" TEXT,
    "openItemManagement" BOOLEAN NOT NULL DEFAULT false,
    "currencyRestriction" VARCHAR(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_gl_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_company_gl_accounts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "glAccountId" TEXT NOT NULL,
    "postingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "manualPostingBlocked" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_company_gl_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_fiscal_year_variants" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "startMonth" INTEGER NOT NULL DEFAULT 1,
    "startDay" INTEGER NOT NULL DEFAULT 1,
    "normalPeriodCount" INTEGER NOT NULL DEFAULT 12,
    "specialPeriodCount" INTEGER NOT NULL DEFAULT 0,
    "calendarYearBased" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_fiscal_year_variants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_posting_period_variants" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "allowSpecialPeriods" BOOLEAN NOT NULL DEFAULT true,
    "closeChecklist" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_posting_period_variants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_account_determination_profiles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_account_determination_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_transaction_keys" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "requiresValuationClass" BOOLEAN NOT NULL DEFAULT false,
    "inventorySide" TEXT NOT NULL DEFAULT 'NONE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_transaction_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_mm_account_mappings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "transactionKeyCode" TEXT NOT NULL,
    "valuationClassId" TEXT,
    "valuationScopeKey" TEXT NOT NULL,
    "debitAccountId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_mm_account_mappings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_posting_period_controls" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalPeriodId" TEXT NOT NULL,
    "accountTypeScope" TEXT NOT NULL DEFAULT 'ALL',
    "status" TEXT NOT NULL,
    "restrictionRules" JSONB,
    "reason" TEXT,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_posting_period_controls_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_posting_period_audit_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalPeriodId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "reason" TEXT,
    "actorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fico_posting_period_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_journal_entry_lines" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "glAccountId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "debitAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL,
    "description" TEXT,
    "materialId" TEXT,
    "warehouseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fico_journal_entry_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_document_sequences" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'JE',
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_document_sequences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_accounting_audit_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "previousValues" JSONB,
    "newValues" JSONB,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fico_accounting_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fico_historical_backposting_runs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "fromDate" DATE,
    "toDate" DATE,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executedBy" TEXT,
    "executedAt" TIMESTAMP(3),
    "summary" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fico_historical_backposting_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fico_company_accounting_settings_companyId_key" ON "fico_company_accounting_settings"("companyId");
CREATE UNIQUE INDEX "fico_company_accounting_settings_accountDeterminationProfil_key" ON "fico_company_accounting_settings"("accountDeterminationProfileId");
CREATE INDEX "fico_company_accounting_settings_status_idx" ON "fico_company_accounting_settings"("status");
CREATE UNIQUE INDEX "fico_charts_of_accounts_code_key" ON "fico_charts_of_accounts"("code");
CREATE INDEX "fico_charts_of_accounts_status_idx" ON "fico_charts_of_accounts"("status");
CREATE INDEX "fico_gl_account_groups_chartOfAccountsId_parentGroupId_sort_idx" ON "fico_gl_account_groups"("chartOfAccountsId", "parentGroupId", "sortOrder");
CREATE UNIQUE INDEX "fico_gl_account_groups_chartOfAccountsId_code_key" ON "fico_gl_account_groups"("chartOfAccountsId", "code");
CREATE INDEX "fico_gl_accounts_chartOfAccountsId_idx" ON "fico_gl_accounts"("chartOfAccountsId");
CREATE INDEX "fico_gl_accounts_accountCode_idx" ON "fico_gl_accounts"("accountCode");
CREATE INDEX "fico_gl_accounts_accountType_status_idx" ON "fico_gl_accounts"("accountType", "status");
CREATE UNIQUE INDEX "fico_gl_accounts_chartOfAccountsId_accountCode_key" ON "fico_gl_accounts"("chartOfAccountsId", "accountCode");
CREATE INDEX "fico_company_gl_accounts_companyId_postingEnabled_idx" ON "fico_company_gl_accounts"("companyId", "postingEnabled");
CREATE UNIQUE INDEX "fico_company_gl_accounts_companyId_glAccountId_key" ON "fico_company_gl_accounts"("companyId", "glAccountId");
CREATE UNIQUE INDEX "fico_fiscal_year_variants_code_key" ON "fico_fiscal_year_variants"("code");
CREATE INDEX "fico_fiscal_year_variants_status_idx" ON "fico_fiscal_year_variants"("status");
CREATE UNIQUE INDEX "fico_posting_period_variants_code_key" ON "fico_posting_period_variants"("code");
CREATE INDEX "fico_posting_period_variants_status_idx" ON "fico_posting_period_variants"("status");
CREATE INDEX "fico_account_determination_profiles_companyId_isDefault_idx" ON "fico_account_determination_profiles"("companyId", "isDefault");
CREATE UNIQUE INDEX "fico_account_determination_profiles_companyId_code_key" ON "fico_account_determination_profiles"("companyId", "code");
CREATE UNIQUE INDEX "fico_transaction_keys_code_key" ON "fico_transaction_keys"("code");
CREATE INDEX "fico_transaction_keys_status_sortOrder_idx" ON "fico_transaction_keys"("status", "sortOrder");
CREATE INDEX "fico_mm_account_mappings_companyId_transactionKeyCode_statu_idx" ON "fico_mm_account_mappings"("companyId", "transactionKeyCode", "status");
CREATE INDEX "fico_mm_account_mappings_debitAccountId_idx" ON "fico_mm_account_mappings"("debitAccountId");
CREATE INDEX "fico_mm_account_mappings_creditAccountId_idx" ON "fico_mm_account_mappings"("creditAccountId");
CREATE UNIQUE INDEX "fico_mm_account_mappings_companyId_profileId_transactionKey_key" ON "fico_mm_account_mappings"("companyId", "profileId", "transactionKeyCode", "valuationScopeKey");
CREATE INDEX "fico_posting_period_controls_companyId_status_idx" ON "fico_posting_period_controls"("companyId", "status");
CREATE UNIQUE INDEX "fico_posting_period_controls_companyId_fiscalPeriodId_accou_key" ON "fico_posting_period_controls"("companyId", "fiscalPeriodId", "accountTypeScope");
CREATE INDEX "fico_posting_period_audit_logs_companyId_fiscalPeriodId_cre_idx" ON "fico_posting_period_audit_logs"("companyId", "fiscalPeriodId", "createdAt");
CREATE INDEX "fico_journal_entry_lines_journalEntryId_idx" ON "fico_journal_entry_lines"("journalEntryId");
CREATE INDEX "fico_journal_entry_lines_companyId_glAccountId_idx" ON "fico_journal_entry_lines"("companyId", "glAccountId");
CREATE UNIQUE INDEX "fico_journal_entry_lines_journalEntryId_lineNumber_key" ON "fico_journal_entry_lines"("journalEntryId", "lineNumber");
CREATE UNIQUE INDEX "fico_document_sequences_companyId_documentType_fiscalYear_key" ON "fico_document_sequences"("companyId", "documentType", "fiscalYear");
CREATE INDEX "fico_accounting_audit_logs_companyId_createdAt_idx" ON "fico_accounting_audit_logs"("companyId", "createdAt");
CREATE INDEX "fico_accounting_audit_logs_entityType_entityId_idx" ON "fico_accounting_audit_logs"("entityType", "entityId");
CREATE INDEX "fico_accounting_audit_logs_action_createdAt_idx" ON "fico_accounting_audit_logs"("action", "createdAt");
CREATE INDEX "fico_historical_backposting_runs_companyId_status_idx" ON "fico_historical_backposting_runs"("companyId", "status");
CREATE INDEX "fico_financial_periods_companyId_startDate_endDate_idx" ON "fico_financial_periods"("companyId", "startDate", "endDate");
CREATE UNIQUE INDEX "fico_journal_entries_sourcePostingKey_key" ON "fico_journal_entries"("sourcePostingKey");
CREATE UNIQUE INDEX "fico_journal_entries_reversalOfId_key" ON "fico_journal_entries"("reversalOfId");
CREATE INDEX "fico_journal_entries_companyId_status_idx" ON "fico_journal_entries"("companyId", "status");
CREATE INDEX "fico_journal_entries_fiscalPeriodId_idx" ON "fico_journal_entries"("fiscalPeriodId");
CREATE INDEX "fico_journal_entries_sourceModule_sourceDocumentType_source_idx" ON "fico_journal_entries"("sourceModule", "sourceDocumentType", "sourceDocumentId");
CREATE INDEX "fico_journal_entries_documentNumber_idx" ON "fico_journal_entries"("documentNumber");
CREATE UNIQUE INDEX "fico_journal_entries_companyId_documentNumber_key" ON "fico_journal_entries"("companyId", "documentNumber");

ALTER TABLE "fico_company_accounting_settings" ADD CONSTRAINT "fico_company_accounting_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_company_accounting_settings" ADD CONSTRAINT "fico_company_accounting_settings_chartOfAccountsId_fkey" FOREIGN KEY ("chartOfAccountsId") REFERENCES "fico_charts_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_company_accounting_settings" ADD CONSTRAINT "fico_company_accounting_settings_fiscalYearVariantId_fkey" FOREIGN KEY ("fiscalYearVariantId") REFERENCES "fico_fiscal_year_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_company_accounting_settings" ADD CONSTRAINT "fico_company_accounting_settings_postingPeriodVariantId_fkey" FOREIGN KEY ("postingPeriodVariantId") REFERENCES "fico_posting_period_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_company_accounting_settings" ADD CONSTRAINT "fico_company_accounting_settings_accountDeterminationProfi_fkey" FOREIGN KEY ("accountDeterminationProfileId") REFERENCES "fico_account_determination_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_gl_account_groups" ADD CONSTRAINT "fico_gl_account_groups_chartOfAccountsId_fkey" FOREIGN KEY ("chartOfAccountsId") REFERENCES "fico_charts_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_gl_account_groups" ADD CONSTRAINT "fico_gl_account_groups_parentGroupId_fkey" FOREIGN KEY ("parentGroupId") REFERENCES "fico_gl_account_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_gl_accounts" ADD CONSTRAINT "fico_gl_accounts_chartOfAccountsId_fkey" FOREIGN KEY ("chartOfAccountsId") REFERENCES "fico_charts_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_gl_accounts" ADD CONSTRAINT "fico_gl_accounts_accountGroupId_fkey" FOREIGN KEY ("accountGroupId") REFERENCES "fico_gl_account_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_company_gl_accounts" ADD CONSTRAINT "fico_company_gl_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_company_gl_accounts" ADD CONSTRAINT "fico_company_gl_accounts_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_account_determination_profiles" ADD CONSTRAINT "fico_account_determination_profiles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_mm_account_mappings" ADD CONSTRAINT "fico_mm_account_mappings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_mm_account_mappings" ADD CONSTRAINT "fico_mm_account_mappings_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "fico_account_determination_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_mm_account_mappings" ADD CONSTRAINT "fico_mm_account_mappings_transactionKeyCode_fkey" FOREIGN KEY ("transactionKeyCode") REFERENCES "fico_transaction_keys"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_mm_account_mappings" ADD CONSTRAINT "fico_mm_account_mappings_valuationClassId_fkey" FOREIGN KEY ("valuationClassId") REFERENCES "mm_valuation_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_mm_account_mappings" ADD CONSTRAINT "fico_mm_account_mappings_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_mm_account_mappings" ADD CONSTRAINT "fico_mm_account_mappings_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_financial_periods" ADD CONSTRAINT "fico_financial_periods_fiscalYearVariantId_fkey" FOREIGN KEY ("fiscalYearVariantId") REFERENCES "fico_fiscal_year_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_posting_period_controls" ADD CONSTRAINT "fico_posting_period_controls_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_posting_period_controls" ADD CONSTRAINT "fico_posting_period_controls_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "fico_financial_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fico_posting_period_audit_logs" ADD CONSTRAINT "fico_posting_period_audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_posting_period_audit_logs" ADD CONSTRAINT "fico_posting_period_audit_logs_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "fico_financial_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_journal_entries" ADD CONSTRAINT "fico_journal_entries_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "fico_financial_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_journal_entries" ADD CONSTRAINT "fico_journal_entries_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "fico_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_journal_entry_lines" ADD CONSTRAINT "fico_journal_entry_lines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "fico_journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fico_journal_entry_lines" ADD CONSTRAINT "fico_journal_entry_lines_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_journal_entry_lines" ADD CONSTRAINT "fico_journal_entry_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_document_sequences" ADD CONSTRAINT "fico_document_sequences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fico_accounting_audit_logs" ADD CONSTRAINT "fico_accounting_audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fico_historical_backposting_runs" ADD CONSTRAINT "fico_historical_backposting_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data integrity constraints.
ALTER TABLE "fico_company_accounting_settings"
    ADD CONSTRAINT "fico_company_accounting_settings_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'INACTIVE')),
    ADD CONSTRAINT "fico_company_accounting_settings_method_check" CHECK ("accountingMethod" IN ('ACCRUAL', 'CASH')),
    ADD CONSTRAINT "fico_company_accounting_settings_currency_check" CHECK (char_length("baseCurrency") = 3),
    ADD CONSTRAINT "fico_company_accounting_settings_padding_check" CHECK ("documentNumberPadding" BETWEEN 3 AND 12);

ALTER TABLE "fico_charts_of_accounts"
    ADD CONSTRAINT "fico_charts_of_accounts_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "fico_gl_account_groups"
    ADD CONSTRAINT "fico_gl_account_groups_category_check" CHECK ("category" IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
    ADD CONSTRAINT "fico_gl_account_groups_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
    ADD CONSTRAINT "fico_gl_account_groups_sort_check" CHECK ("sortOrder" >= 0);

ALTER TABLE "fico_gl_accounts"
    ADD CONSTRAINT "fico_gl_accounts_type_check" CHECK ("accountType" IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
    ADD CONSTRAINT "fico_gl_accounts_normal_balance_check" CHECK ("normalBalance" IN ('DEBIT', 'CREDIT')),
    ADD CONSTRAINT "fico_gl_accounts_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
    ADD CONSTRAINT "fico_gl_accounts_currency_check" CHECK ("currencyRestriction" IS NULL OR char_length("currencyRestriction") = 3);

ALTER TABLE "fico_company_gl_accounts"
    ADD CONSTRAINT "fico_company_gl_accounts_effective_check" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" >= "effectiveFrom");

ALTER TABLE "fico_fiscal_year_variants"
    ADD CONSTRAINT "fico_fiscal_year_variants_month_check" CHECK ("startMonth" BETWEEN 1 AND 12),
    ADD CONSTRAINT "fico_fiscal_year_variants_day_check" CHECK ("startDay" BETWEEN 1 AND 31),
    ADD CONSTRAINT "fico_fiscal_year_variants_normal_count_check" CHECK ("normalPeriodCount" BETWEEN 1 AND 12),
    ADD CONSTRAINT "fico_fiscal_year_variants_special_count_check" CHECK ("specialPeriodCount" BETWEEN 0 AND 4),
    ADD CONSTRAINT "fico_fiscal_year_variants_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "fico_posting_period_variants"
    ADD CONSTRAINT "fico_posting_period_variants_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "fico_account_determination_profiles"
    ADD CONSTRAINT "fico_account_determination_profiles_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "fico_transaction_keys"
    ADD CONSTRAINT "fico_transaction_keys_inventory_side_check" CHECK ("inventorySide" IN ('DEBIT_INVENTORY', 'CREDIT_INVENTORY', 'NONE')),
    ADD CONSTRAINT "fico_transaction_keys_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "fico_mm_account_mappings"
    ADD CONSTRAINT "fico_mm_account_mappings_scope_check" CHECK ("valuationScopeKey" = '*' OR "valuationClassId" IS NOT NULL),
    ADD CONSTRAINT "fico_mm_account_mappings_effective_check" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" >= "effectiveFrom"),
    ADD CONSTRAINT "fico_mm_account_mappings_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "fico_financial_periods"
    ADD CONSTRAINT "fico_financial_periods_date_check" CHECK ("endDate" >= "startDate"),
    ADD CONSTRAINT "fico_financial_periods_number_check" CHECK ("periodNumber" BETWEEN 1 AND 16),
    ADD CONSTRAINT "fico_financial_periods_type_check" CHECK ("periodType" IN ('NORMAL', 'SPECIAL')),
    ADD CONSTRAINT "fico_financial_periods_status_check" CHECK ("status" IN ('FUTURE', 'OPEN', 'RESTRICTED', 'CLOSED', 'LOCKED'));

ALTER TABLE "fico_posting_period_controls"
    ADD CONSTRAINT "fico_posting_period_controls_scope_check" CHECK ("accountTypeScope" IN ('ALL', 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
    ADD CONSTRAINT "fico_posting_period_controls_status_check" CHECK ("status" IN ('FUTURE', 'OPEN', 'RESTRICTED', 'CLOSED', 'LOCKED'));

ALTER TABLE "fico_journal_entries"
    ADD CONSTRAINT "fico_journal_entries_total_check" CHECK ("totalAmount" >= 0),
    ADD CONSTRAINT "fico_journal_entries_currency_check" CHECK (char_length("currencyCode") = 3),
    ADD CONSTRAINT "fico_journal_entries_status_check" CHECK ("status" IN ('DRAFT', 'POSTED', 'REVERSED', 'LEGACY')),
    ADD CONSTRAINT "fico_journal_entries_document_type_check" CHECK ("documentType" IN ('JOURNAL', 'MANUAL', 'MM_GR', 'MM_GI', 'MM_ADJUSTMENT', 'MM_REVERSAL', 'SUPPLIER_INVOICE', 'LEGACY'));

ALTER TABLE "fico_journal_entry_lines"
    ADD CONSTRAINT "fico_journal_entry_lines_amount_check" CHECK ("debitAmount" >= 0 AND "creditAmount" >= 0),
    ADD CONSTRAINT "fico_journal_entry_lines_one_side_check" CHECK (
        ("debitAmount" > 0 AND "creditAmount" = 0) OR
        ("creditAmount" > 0 AND "debitAmount" = 0)
    ),
    ADD CONSTRAINT "fico_journal_entry_lines_currency_check" CHECK (char_length("currency") = 3),
    ADD CONSTRAINT "fico_journal_entry_lines_line_number_check" CHECK ("lineNumber" > 0);

ALTER TABLE "fico_document_sequences"
    ADD CONSTRAINT "fico_document_sequences_number_check" CHECK ("nextNumber" > 0),
    ADD CONSTRAINT "fico_document_sequences_padding_check" CHECK ("padding" BETWEEN 3 AND 12);

ALTER TABLE "fico_historical_backposting_runs"
    ADD CONSTRAINT "fico_historical_backposting_runs_status_check" CHECK ("status" IN ('PREVIEW', 'APPROVED', 'EXECUTED', 'FAILED', 'CANCELLED')),
    ADD CONSTRAINT "fico_historical_backposting_runs_date_check" CHECK ("toDate" IS NULL OR "fromDate" IS NULL OR "toDate" >= "fromDate");

-- Posted accounting documents and journal lines are immutable. A posted document may only transition
-- to REVERSED, and only when no financial fields are changed.
CREATE OR REPLACE FUNCTION fico_guard_journal_entry_mutation() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD."status" IN ('POSTED', 'REVERSED', 'LEGACY') THEN
            RAISE EXCEPTION 'Posted accounting document % is immutable', OLD."id";
        END IF;
        RETURN OLD;
    END IF;

    IF OLD."status" IN ('POSTED', 'REVERSED', 'LEGACY') THEN
        IF OLD."status" = 'POSTED'
           AND NEW."status" = 'REVERSED'
           AND (to_jsonb(NEW) - 'status' - 'updatedAt') = (to_jsonb(OLD) - 'status' - 'updatedAt') THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Posted accounting document % is immutable', OLD."id";
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "fico_journal_entries_immutable"
BEFORE UPDATE OR DELETE ON "fico_journal_entries"
FOR EACH ROW EXECUTE FUNCTION fico_guard_journal_entry_mutation();

CREATE OR REPLACE FUNCTION fico_guard_journal_line_mutation() RETURNS trigger AS $$
DECLARE
    parent_id TEXT;
    parent_status TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        parent_id := OLD."journalEntryId";
    ELSE
        parent_id := NEW."journalEntryId";
    END IF;

    SELECT "status" INTO parent_status FROM "fico_journal_entries" WHERE "id" = parent_id;
    IF parent_status IN ('POSTED', 'REVERSED', 'LEGACY') THEN
        RAISE EXCEPTION 'Journal lines for posted accounting document % are immutable', parent_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "fico_journal_entry_lines_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "fico_journal_entry_lines"
FOR EACH ROW EXECUTE FUNCTION fico_guard_journal_line_mutation();

-- Audit records are append-only.
CREATE OR REPLACE FUNCTION fico_guard_audit_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'FICO audit records are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "fico_accounting_audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "fico_accounting_audit_logs"
FOR EACH ROW EXECUTE FUNCTION fico_guard_audit_mutation();

CREATE TRIGGER "fico_posting_period_audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "fico_posting_period_audit_logs"
FOR EACH ROW EXECUTE FUNCTION fico_guard_audit_mutation();
