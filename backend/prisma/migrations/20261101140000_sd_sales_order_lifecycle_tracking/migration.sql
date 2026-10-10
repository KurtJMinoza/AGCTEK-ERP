-- Sales-order milestones used by approval, fulfillment tracking, courier
-- display, and proof-of-delivery synchronization.
--
-- IF NOT EXISTS keeps this safe for databases where these columns were added
-- manually while the original schema-only change was present.
ALTER TABLE "sd_sales_orders"
    ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "shippedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "trackingNumber" TEXT,
    ADD COLUMN IF NOT EXISTS "courierName" TEXT,
    ADD COLUMN IF NOT EXISTS "proofOfDeliveryUrl" TEXT;
