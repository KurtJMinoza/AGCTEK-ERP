-- Phase 1C: Quality Analytics & CAPA Expansion
-- Extends MmCorrectiveAction with full 8D fields and lifecycle statuses.

-- Step 1: Add new columns
ALTER TABLE "mm_corrective_actions" ADD COLUMN "problem" TEXT;
ALTER TABLE "mm_corrective_actions" ADD COLUMN "rootCause" TEXT;
ALTER TABLE "mm_corrective_actions" ADD COLUMN "containment" TEXT;
ALTER TABLE "mm_corrective_actions" ADD COLUMN "correctiveAction" TEXT;
ALTER TABLE "mm_corrective_actions" ADD COLUMN "preventiveAction" TEXT;
ALTER TABLE "mm_corrective_actions" ADD COLUMN "resolution" TEXT;
ALTER TABLE "mm_corrective_actions" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "mm_corrective_actions" ADD COLUMN "verifiedBy" TEXT;
ALTER TABLE "mm_corrective_actions" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "mm_corrective_actions" ADD COLUMN "closedBy" TEXT;

-- Step 2: Migrate existing description → problem for existing rows
UPDATE "mm_corrective_actions" SET "problem" = "description" WHERE "problem" IS NULL AND "description" IS NOT NULL;

-- Step 3: Drop the old description column
ALTER TABLE "mm_corrective_actions" DROP COLUMN "description";

-- Step 4: Map CANCELLED → CLOSED for existing rows
UPDATE "mm_corrective_actions" SET "status" = 'CLOSED', "closedAt" = NOW() WHERE "status" = 'CANCELLED';

-- Step 5: Add status index for CAPA queries
CREATE INDEX "mm_corrective_actions_status_idx" ON "mm_corrective_actions"("status");
