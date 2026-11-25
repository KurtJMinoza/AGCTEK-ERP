-- Phase 04.16–04.19 extended rule dimensions (treasury, AA, PP/CO)

ALTER TABLE "fico_account_determination_rules" ADD COLUMN IF NOT EXISTS "paymentMethodCode" TEXT;
ALTER TABLE "fico_account_determination_rules" ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT;
ALTER TABLE "fico_account_determination_rules" ADD COLUMN IF NOT EXISTS "paymentProviderCode" TEXT;
ALTER TABLE "fico_account_determination_rules" ADD COLUMN IF NOT EXISTS "currencyCode" TEXT;
ALTER TABLE "fico_account_determination_rules" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "fico_account_determination_rules" ADD COLUMN IF NOT EXISTS "assetClassCode" TEXT;
ALTER TABLE "fico_account_determination_rules" ADD COLUMN IF NOT EXISTS "depreciationAreaCode" TEXT;
ALTER TABLE "fico_account_determination_rules" ADD COLUMN IF NOT EXISTS "documentTypeCode" TEXT;
ALTER TABLE "fico_account_determination_rules" ADD COLUMN IF NOT EXISTS "productionOrderTypeCode" TEXT;
ALTER TABLE "fico_account_determination_rules" ADD COLUMN IF NOT EXISTS "costElementCategoryCode" TEXT;
ALTER TABLE "fico_account_determination_rules" ADD COLUMN IF NOT EXISTS "controllingAreaCode" TEXT;

CREATE INDEX IF NOT EXISTS "fico_account_determination_rules_branchId_idx"
    ON "fico_account_determination_rules"("branchId");
CREATE INDEX IF NOT EXISTS "fico_account_determination_rules_paymentMethodCode_idx"
    ON "fico_account_determination_rules"("paymentMethodCode");
CREATE INDEX IF NOT EXISTS "fico_account_determination_rules_bankAccountId_idx"
    ON "fico_account_determination_rules"("bankAccountId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fico_account_determination_rules_branchId_fkey'
    ) THEN
        ALTER TABLE "fico_account_determination_rules"
            ADD CONSTRAINT "fico_account_determination_rules_branchId_fkey"
            FOREIGN KEY ("branchId") REFERENCES "branches"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;