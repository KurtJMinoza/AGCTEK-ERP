-- Align TripStatus with Phase 3 spine (idempotent)
ALTER TYPE "TripStatus" ADD VALUE IF NOT EXISTS 'PLANNED';
ALTER TYPE "TripStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE "TripStatus" ADD VALUE IF NOT EXISTS 'IN_TRANSIT';

-- Legacy label if still present in some environments
DO $$
BEGIN
  UPDATE "Trip" SET status = 'IN_TRANSIT' WHERE status::text = 'IN_PROGRESS';
EXCEPTION
  WHEN others THEN NULL;
END $$;

ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "externalOrderId" TEXT;
