-- Product Catalog variants link EXISTING Material Master items.
--
-- 1. sd_product_variants.idempotencyKey — a double submit of "Add Variant"
--    must not create two variants.
-- 2. A material may back only ONE active variant. Shared inventory across
--    variants is not supported: each sellable variation is its own material.
--    This is a partial unique index (Prisma cannot model it) — keep the
--    statement below when a future migration is generated, otherwise Prisma
--    proposes dropping it.

ALTER TABLE "sd_product_variants"
    ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "sd_product_variants_idempotencyKey_key"
    ON "sd_product_variants"("idempotencyKey");

-- One active variant per material.
CREATE UNIQUE INDEX IF NOT EXISTS "sd_product_variants_active_material_key"
    ON "sd_product_variants"("materialId")
    WHERE "isActive" = true AND "materialId" IS NOT NULL;

-- Index on the material reference (stock lookups per variant).
CREATE INDEX IF NOT EXISTS "sd_product_variants_materialId_idx"
    ON "sd_product_variants"("materialId");
