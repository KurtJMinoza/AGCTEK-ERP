-- Product lifecycle status + order-line snapshots so deleting a product can no
-- longer break historical picking/packing/shipment/invoice display.
-- SdProduct.status mirrors `isActive` (ACTIVE = sellable); INACTIVE / ARCHIVED
-- stay in the admin catalog but are hidden from storefront, POS and order search.
-- SdSalesOrderLine already carries variantNameSnapshot (variantName) and
-- unitPriceSnapshot (unitPrice); this adds the SKU / material-code snapshots.
ALTER TABLE "sd_products"
    ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "sd_sales_order_lines"
    ADD COLUMN IF NOT EXISTS "productSkuSnapshot" TEXT,
    ADD COLUMN IF NOT EXISTS "materialCodeSnapshot" TEXT;

-- Existing rows: keep isActive and status consistent.
UPDATE "sd_products" SET "status" = 'ACTIVE' WHERE "isActive" = true;
UPDATE "sd_products" SET "status" = 'INACTIVE' WHERE "isActive" = false;
