-- Unified Product-Variant Architecture: schema additions for product config,
-- hidden default variants, combination keys, and catalog source tracking.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. SdProduct: productConfig, idempotencyKey (defaultVariantId already exists)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE "sd_products"
    ADD COLUMN IF NOT EXISTS "productConfig" TEXT NOT NULL DEFAULT 'SIMPLE',
    ADD COLUMN IF NOT EXISTS "defaultVariantId" TEXT,
    ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "sd_products_idempotencyKey_key"
    ON "sd_products"("idempotencyKey");

-- ────────────────────────────────────────────────────────────────────────────
-- 2. SdProductVariant: combinationKey, isPublished, isHidden
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE "sd_product_variants"
    ADD COLUMN IF NOT EXISTS "combinationKey" TEXT NOT NULL DEFAULT '__default__',
    ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "isHidden" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "sd_product_variants_productId_combinationKey_key"
    ON "sd_product_variants"("productId", "combinationKey");

-- ────────────────────────────────────────────────────────────────────────────
-- 3. MmMaterial: catalogVariantId, catalogSource (source tracking)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE "mm_materials"
    ADD COLUMN IF NOT EXISTS "catalogVariantId" TEXT,
    ADD COLUMN IF NOT EXISTS "catalogSource" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'mm_materials_catalogVariantId_fkey'
    ) THEN
        ALTER TABLE "mm_materials"
            ADD CONSTRAINT "mm_materials_catalogVariantId_fkey"
            FOREIGN KEY ("catalogVariantId")
            REFERENCES "sd_product_variants"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
