-- MM package ship-to fields for SCM auto-release
ALTER TABLE "wm_packages" ADD COLUMN IF NOT EXISTS "shipToName" TEXT;
ALTER TABLE "wm_packages" ADD COLUMN IF NOT EXISTS "shipToAddress" TEXT;
ALTER TABLE "wm_packages" ADD COLUMN IF NOT EXISTS "shipToLat" DOUBLE PRECISION;
ALTER TABLE "wm_packages" ADD COLUMN IF NOT EXISTS "shipToLng" DOUBLE PRECISION;

-- Link SCM shipment to MM package + goods issue
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "packageId" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "goodsIssueId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Shipment_packageId_key" ON "Shipment"("packageId");
CREATE INDEX IF NOT EXISTS "Shipment_packageId_idx" ON "Shipment"("packageId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Shipment_packageId_fkey'
  ) THEN
    ALTER TABLE "Shipment"
      ADD CONSTRAINT "Shipment_packageId_fkey"
      FOREIGN KEY ("packageId") REFERENCES "wm_packages"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
