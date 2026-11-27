-- Phase 01 — financial accounting foundation enhancement.
-- Additive-only: existing records keep working with defaults.

ALTER TABLE "fico_company_accounting_settings"
    ADD COLUMN "postingPrecision" INTEGER NOT NULL DEFAULT 4,
    ADD COLUMN "defaultFinancialDimensions" JSONB,
    ADD COLUMN "reconciliationPolicy" TEXT NOT NULL DEFAULT 'BLOCK_MANUAL';

ALTER TABLE "fico_gl_accounts"
    ADD COLUMN "financialStatementMapping" TEXT,
    ADD COLUMN "taxCategory" TEXT,
    ADD COLUMN "requiresBranch" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "requiresCostCenter" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "requiresProfitCenter" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "fico_journal_entry_lines"
    ADD COLUMN "branchId" TEXT,
    ADD COLUMN "costCenterId" TEXT,
    ADD COLUMN "profitCenterId" TEXT;
