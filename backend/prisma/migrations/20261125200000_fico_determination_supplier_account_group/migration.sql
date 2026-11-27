-- Phase 04 Stage C — supplier reconciliation determination dimension (additive)

ALTER TABLE "fico_account_determination_rules"
    ADD COLUMN IF NOT EXISTS "supplierAccountGroup" TEXT;
