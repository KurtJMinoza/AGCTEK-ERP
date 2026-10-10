-- Repair installations where the e-commerce fulfilment migration was recorded
-- before the SD lifecycle fields were added to the application schema.
-- These columns only describe SD lifecycle state; they do not post inventory.
ALTER TABLE "sd_sales_orders"
    ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "shippedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "trackingNumber" TEXT,
    ADD COLUMN IF NOT EXISTS "courierName" TEXT,
    ADD COLUMN IF NOT EXISTS "proofOfDeliveryUrl" TEXT;
