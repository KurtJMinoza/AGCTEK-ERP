-- Phase 03 — durable accounting event ledger and recovery metadata

ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "sourceDocumentNumber" TEXT;
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "postingPurpose" TEXT;
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "businessOccurrenceId" TEXT;
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "documentDate" DATE;
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "valuationSnapshot" JSONB;
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "taxSnapshot" JSONB;
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "accountingDimensions" JSONB;
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "payloadSchemaVersion" TEXT DEFAULT 'v2';
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "correlationId" TEXT;
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "causationId" TEXT;
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "journalEntryIds" JSONB;
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "retryEligible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "retryAfter" TIMESTAMP(3);
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "mm_accounting_events_status_retryAfter_idx"
    ON "mm_accounting_events"("status", "retryAfter");
CREATE INDEX IF NOT EXISTS "mm_accounting_events_correlationId_idx"
    ON "mm_accounting_events"("correlationId");