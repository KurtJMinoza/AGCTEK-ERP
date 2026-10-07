-- MM Warehouse is the single source of truth for SCM pickup / return coordinates.
-- Existing rows start unconfirmed: no coordinates are invented.
ALTER TABLE "warehouses" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "warehouses" ADD COLUMN "lng" DOUBLE PRECISION;
ALTER TABLE "warehouses" ADD COLUMN "geocodeConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "warehouses" ADD COLUMN "geocodeConfirmedAt" TIMESTAMP(3);
