-- Additive journal lifecycle fields (Phase 04)
ALTER TABLE "fico_journal_entries"
    ADD COLUMN IF NOT EXISTS "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;