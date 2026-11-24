-- External platform sales lines reference the SD Product Catalog item that was sold.
-- Additive only: existing lines keep their material and get NULL catalog fields.
ALTER TABLE "sd_ext_platform_transaction_lines"
    ADD COLUMN "productId"   TEXT,
    ADD COLUMN "variantId"   TEXT,
    ADD COLUMN "productName" TEXT,
    ADD COLUMN "variantName" TEXT;

CREATE INDEX "sd_ext_platform_transaction_lines_productId_idx"
    ON "sd_ext_platform_transaction_lines"("productId");
