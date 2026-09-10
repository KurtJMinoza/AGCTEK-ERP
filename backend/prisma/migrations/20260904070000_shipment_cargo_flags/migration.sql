-- Optional cargo handling / identity fields for SCM load visibility
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "materialCode" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "isFragile" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "requiresColdChain" BOOLEAN NOT NULL DEFAULT false;
