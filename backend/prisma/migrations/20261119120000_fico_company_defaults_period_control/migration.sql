-- FICO foundation configuration completion.
-- Extends the existing company accounting configuration, fiscal period calendar
-- and period audit trail. Additive only: no table is duplicated and existing
-- rows keep working through backward-compatible defaults.

-- ---------------------------------------------------------------------------
-- Company accounting settings: group currency, default G/L accounts and
-- posting controls.
-- ---------------------------------------------------------------------------
ALTER TABLE "fico_company_accounting_settings"
    ADD COLUMN "groupCurrency" VARCHAR(3),
    ADD COLUMN "defaultRetainedEarningsAccountId" TEXT,
    ADD COLUMN "defaultCashAccountId" TEXT,
    ADD COLUMN "defaultReceivableAccountId" TEXT,
    ADD COLUMN "defaultPayableAccountId" TEXT,
    ADD COLUMN "defaultInventoryAccountId" TEXT,
    ADD COLUMN "defaultSalesRevenueAccountId" TEXT,
    ADD COLUMN "defaultCostOfGoodsSoldAccountId" TEXT,
    ADD COLUMN "defaultTaxInputAccountId" TEXT,
    ADD COLUMN "defaultTaxOutputAccountId" TEXT,
    ADD COLUMN "allowNegativePostings" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "backdatedPostingAllowed" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "maxBackdatedPostingDays" INTEGER;

ALTER TABLE "fico_company_accounting_settings"
    ADD CONSTRAINT "fico_company_accounting_settings_defaultRetainedEarningsAc_fkey" FOREIGN KEY ("defaultRetainedEarningsAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "fico_company_accounting_settings_defaultCashAccountId_fkey" FOREIGN KEY ("defaultCashAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "fico_company_accounting_settings_defaultReceivableAccountI_fkey" FOREIGN KEY ("defaultReceivableAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "fico_company_accounting_settings_defaultPayableAccountId_fkey" FOREIGN KEY ("defaultPayableAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "fico_company_accounting_settings_defaultInventoryAccountId_fkey" FOREIGN KEY ("defaultInventoryAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "fico_company_accounting_settings_defaultSalesRevenueAccoun_fkey" FOREIGN KEY ("defaultSalesRevenueAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "fico_company_accounting_settings_defaultCostOfGoodsSoldAcc_fkey" FOREIGN KEY ("defaultCostOfGoodsSoldAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "fico_company_accounting_settings_defaultTaxInputAccountId_fkey" FOREIGN KEY ("defaultTaxInputAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "fico_company_accounting_settings_defaultTaxOutputAccountId_fkey" FOREIGN KEY ("defaultTaxOutputAccountId") REFERENCES "fico_gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fico_company_accounting_settings"
    ADD CONSTRAINT "fico_company_accounting_settings_group_currency_check"
        CHECK ("groupCurrency" IS NULL OR char_length("groupCurrency") = 3),
    ADD CONSTRAINT "fico_company_accounting_settings_backdated_days_check"
        CHECK ("maxBackdatedPostingDays" IS NULL OR "maxBackdatedPostingDays" BETWEEN 0 AND 3650);

-- ---------------------------------------------------------------------------
-- Fiscal periods: closing / locking business dates, reopening trail and remarks.
-- All columns are nullable so existing periods remain valid.
-- ---------------------------------------------------------------------------
ALTER TABLE "fico_financial_periods"
    ADD COLUMN "remarks" TEXT,
    ADD COLUMN "closingDate" DATE,
    ADD COLUMN "lockDate" DATE,
    ADD COLUMN "reopenedAt" TIMESTAMP(3),
    ADD COLUMN "reopenedBy" TEXT;

ALTER TABLE "fico_financial_periods"
    ADD CONSTRAINT "fico_financial_periods_closing_date_check"
        CHECK ("closingDate" IS NULL OR "closingDate" >= "startDate"),
    ADD CONSTRAINT "fico_financial_periods_lock_date_check"
        CHECK ("lockDate" IS NULL OR "lockDate" >= "startDate");
