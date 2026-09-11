-- Align TripStatus with Phase 3 Execute flow (ASSIGNED / IN_TRANSIT)
-- Idempotent where possible for partially applied environments.

DO $$ BEGIN
  ALTER TYPE "TripStatus" RENAME VALUE 'PLANNED' TO 'ASSIGNED';
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "TripStatus" RENAME VALUE 'IN_PROGRESS' TO 'IN_TRANSIT';
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "externalOrderId" TEXT;
