-- Phase 02 — account determination rule dimensions (material group, tax code, sales channel)

ALTER TABLE "fico_account_determination_rules"
    ADD COLUMN IF NOT EXISTS "materialGroupCode" TEXT,
    ADD COLUMN IF NOT EXISTS "salesChannelCode" TEXT,
    ADD COLUMN IF NOT EXISTS "taxCodeId" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fico_account_determination_rules_taxCodeId_fkey'
    ) THEN
        ALTER TABLE "fico_account_determination_rules"
            ADD CONSTRAINT "fico_account_determination_rules_taxCodeId_fkey"
            FOREIGN KEY ("taxCodeId") REFERENCES "fico_tax_codes"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "fico_account_determination_rules_materialGroupCode_idx"
    ON "fico_account_determination_rules"("materialGroupCode");
CREATE INDEX IF NOT EXISTS "fico_account_determination_rules_salesChannelCode_idx"
    ON "fico_account_determination_rules"("salesChannelCode");
CREATE INDEX IF NOT EXISTS "fico_account_determination_rules_taxCodeId_idx"
    ON "fico_account_determination_rules"("taxCodeId");