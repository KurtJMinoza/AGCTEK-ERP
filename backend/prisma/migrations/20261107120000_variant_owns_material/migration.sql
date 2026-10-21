-- Variant owns the material — deprecate the parent-level product→material
-- assignment for VARIABLE products.
--
-- Target architecture:
--   parent product  = display / grouping only, holds NO stock
--   variant         = the sellable stock item, owns exactly one MM material
--
-- This is a DATA migration (no schema change):
--   1. A legacy VARIABLE product whose parent has exactly ONE ACTIVE
--      assignment and whose variants have no material yet inherits that
--      material (the unambiguous case — existing stock is preserved).
--   2. The linked material is marked as catalog-sourced.
--   3. Parent assignments of VARIABLE products are DEACTIVATED, not deleted:
--      the rows stay so the change is reversible and historical orders keep
--      resolving. SIMPLE products keep their single ACTIVE assignment.

-- ---------------------------------------------------------------------------
-- 1. Variants without a material inherit the product's sole ACTIVE assignment
-- ---------------------------------------------------------------------------
WITH sole_assignment AS (
    SELECT a."productId",
           MIN(a."materialId") AS "materialId",
           MIN(a."companyId")  AS "companyId"
    FROM "sd_product_material_assignments" a
    JOIN "sd_products" p ON p."id" = a."productId"
    WHERE a."status" = 'ACTIVE'
      AND p."productConfig" = 'VARIABLE'
    GROUP BY a."productId"
    HAVING COUNT(*) = 1
)
UPDATE "sd_product_variants" v
SET "materialId" = s."materialId",
    "companyId"  = COALESCE(v."companyId", s."companyId")
FROM sole_assignment s
WHERE v."productId" = s."productId"
  AND v."materialId" IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Mark catalog-sourced materials (only when one variant owns the material)
-- ---------------------------------------------------------------------------
UPDATE "mm_materials" m
SET "catalogVariantId" = v."id",
    "catalogSource"    = COALESCE(m."catalogSource", 'MANUALLY_LINKED')
FROM "sd_product_variants" v
WHERE v."materialId" = m."id"
  AND m."catalogVariantId" IS NULL
  AND v."isActive" = true
  AND (
      SELECT COUNT(*)
      FROM "sd_product_variants" v2
      WHERE v2."materialId" = m."id"
        AND v2."isActive" = true
  ) = 1;

-- ---------------------------------------------------------------------------
-- 3. Deprecate the parent assignment of VARIABLE products
-- ---------------------------------------------------------------------------
UPDATE "sd_product_material_assignments" a
SET "status"     = 'INACTIVE',
    "effectiveTo" = COALESCE(a."effectiveTo", NOW()),
    "updatedAt"  = NOW()
FROM "sd_products" p
WHERE p."id" = a."productId"
  AND p."productConfig" = 'VARIABLE'
  AND a."status" = 'ACTIVE';
