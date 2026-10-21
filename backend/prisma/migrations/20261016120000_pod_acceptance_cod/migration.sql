-- Phase 1 COD partial accept: stop-level COD due after POD acceptance.
-- Null = use the full payment amount (today's behaviour).
ALTER TABLE "TripStop" ADD COLUMN IF NOT EXISTS "codAmountDue" DECIMAL(18, 2);

-- Accepted qty at POD on cargo-first stop lines (null = not recorded / full accept).
ALTER TABLE "TripStopLine" ADD COLUMN IF NOT EXISTS "acceptedQuantity" INTEGER;
