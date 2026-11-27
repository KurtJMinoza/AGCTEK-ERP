-- Phase 04: transaction key catalogue metadata (additive)
ALTER TABLE "fico_transaction_keys" ADD COLUMN IF NOT EXISTS "owningModule" TEXT NOT NULL DEFAULT 'MM';
ALTER TABLE "fico_transaction_keys" ADD COLUMN IF NOT EXISTS "accountingCategory" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "fico_transaction_keys" ADD COLUMN IF NOT EXISTS "supportedSourceModules" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "fico_transaction_keys" ADD COLUMN IF NOT EXISTS "automaticPostingEligible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "fico_transaction_keys" ADD COLUMN IF NOT EXISTS "systemDefined" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "fico_transaction_keys" ADD COLUMN IF NOT EXISTS "integrationStatus" TEXT NOT NULL DEFAULT 'NOT_AVAILABLE';

ALTER TABLE "fico_transaction_keys" DROP CONSTRAINT IF EXISTS "fico_transaction_keys_integration_status_check";
ALTER TABLE "fico_transaction_keys"
    ADD CONSTRAINT "fico_transaction_keys_integration_status_check"
    CHECK ("integrationStatus" IN ('LIVE', 'CONFIG_ONLY', 'NOT_AVAILABLE'));

CREATE INDEX IF NOT EXISTS "fico_transaction_keys_owningModule_status_idx"
    ON "fico_transaction_keys"("owningModule", "status");