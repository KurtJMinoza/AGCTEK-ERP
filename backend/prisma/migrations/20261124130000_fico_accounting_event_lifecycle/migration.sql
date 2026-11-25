-- Accounting event processing lifecycle (Phase 13)
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "lastErrorCode" TEXT;
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "processingStartedAt" TIMESTAMP(3);
ALTER TABLE "mm_accounting_events" ADD COLUMN IF NOT EXISTS "outcomeReason" TEXT;