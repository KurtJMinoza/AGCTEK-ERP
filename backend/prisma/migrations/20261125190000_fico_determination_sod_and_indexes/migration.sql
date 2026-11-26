-- Phase 04.27 maker-checker flag + Phase 04.30 resolution indexes

ALTER TABLE "fico_company_accounting_settings"
    ADD COLUMN IF NOT EXISTS "determinationSeparationOfDuties" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "fico_adr_company_key_status_priority_idx"
    ON "fico_account_determination_rules"("companyId", "transactionKeyCode", "status", "priority");

CREATE INDEX IF NOT EXISTS "fico_adr_company_status_effective_idx"
    ON "fico_account_determination_rules"("companyId", "status", "effectiveFrom", "effectiveTo");

CREATE INDEX IF NOT EXISTS "fico_adr_transaction_key_idx"
    ON "fico_account_determination_rules"("transactionKeyCode");

-- Exception monitoring reads pending/failed events per company with an error code.
CREATE INDEX IF NOT EXISTS "mm_accounting_events_company_status_errorcode_idx"
    ON "mm_accounting_events"("companyId", "status", "lastErrorCode");