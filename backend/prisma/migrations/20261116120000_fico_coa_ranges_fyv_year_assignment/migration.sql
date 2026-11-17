-- FICO Phase 1: chart account-code length, account-group code ranges, fiscal-year labelling rule.
-- Additive only: nullable columns or columns with defaults that preserve current behaviour.

ALTER TABLE "fico_charts_of_accounts" ADD COLUMN "accountCodeLength" INTEGER;
ALTER TABLE "fico_charts_of_accounts" ADD CONSTRAINT "fico_charts_of_accounts_code_length_check"
    CHECK ("accountCodeLength" IS NULL OR ("accountCodeLength" BETWEEN 1 AND 32));

ALTER TABLE "fico_gl_account_groups" ADD COLUMN "rangeFrom" TEXT;
ALTER TABLE "fico_gl_account_groups" ADD COLUMN "rangeTo" TEXT;
ALTER TABLE "fico_gl_account_groups" ADD CONSTRAINT "fico_gl_account_groups_range_check"
    CHECK (
        ("rangeFrom" IS NULL AND "rangeTo" IS NULL)
        OR ("rangeFrom" IS NOT NULL AND "rangeTo" IS NOT NULL AND "rangeFrom" COLLATE "C" <= "rangeTo" COLLATE "C")
    );

-- Existing variants label a fiscal year by the calendar year it starts in.
ALTER TABLE "fico_fiscal_year_variants" ADD COLUMN "yearAssignment" TEXT NOT NULL DEFAULT 'YEAR_START';
ALTER TABLE "fico_fiscal_year_variants" ADD CONSTRAINT "fico_fiscal_year_variants_year_assignment_check"
    CHECK ("yearAssignment" IN ('YEAR_START', 'YEAR_END'));
