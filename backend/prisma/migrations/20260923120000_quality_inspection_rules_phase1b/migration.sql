-- Phase 1B: Quality Inspection Rule Engine

CREATE TABLE "mm_quality_inspection_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "materialId" TEXT,
    "materialCategoryId" TEXT,
    "supplierId" TEXT,
    "supplierCategoryId" TEXT,
    "plantId" TEXT,
    "warehouseId" TEXT,
    "purchaseType" TEXT,
    "receiptType" TEXT,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mm_quality_inspection_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mm_quality_inspection_rules_companyId_ruleCode_key"
    ON "mm_quality_inspection_rules"("companyId", "ruleCode");
CREATE INDEX "mm_quality_inspection_rules_companyId_active_priority_idx"
    ON "mm_quality_inspection_rules"("companyId", "active", "priority");

ALTER TABLE "mm_quality_inspection_rules"
    ADD CONSTRAINT "mm_quality_inspection_rules_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One-time seed: convert legacy master-data boolean flags into editable rules.
-- Seeded rules are editable via /modules/mm/receiving/inspection-rules admin UI.

INSERT INTO "mm_quality_inspection_rules" (
    "id", "companyId", "ruleCode", "name", "priority", "active", "action", "updatedAt",
    "materialId"
)
SELECT
    gen_random_uuid()::text,
    m."companyId",
    'SEED-MAT-' || m."materialCode",
    'Seeded: material ' || m."materialCode" || ' requires inspection',
    100,
    true,
    'INSPECTION_REQUIRED',
    CURRENT_TIMESTAMP,
    m."id"
FROM "mm_materials" m
WHERE m."qualityInspectionRequired" = true
  AND NOT EXISTS (
      SELECT 1 FROM "mm_quality_inspection_rules" r
      WHERE r."companyId" = m."companyId" AND r."ruleCode" = 'SEED-MAT-' || m."materialCode"
  );

INSERT INTO "mm_quality_inspection_rules" (
    "id", "companyId", "ruleCode", "name", "priority", "active", "action", "updatedAt",
    "warehouseId"
)
SELECT
    gen_random_uuid()::text,
    w."companyId",
    'SEED-WH-' || w."code",
    'Seeded: warehouse ' || w."code" || ' requires inspection',
    90,
    true,
    'INSPECTION_REQUIRED',
    CURRENT_TIMESTAMP,
    w."id"
FROM "warehouses" w
WHERE w."qualityInspectionRequired" = true
  AND NOT EXISTS (
      SELECT 1 FROM "mm_quality_inspection_rules" r
      WHERE r."companyId" = w."companyId" AND r."ruleCode" = 'SEED-WH-' || w."code"
  );

INSERT INTO "mm_quality_inspection_rules" (
    "id", "companyId", "ruleCode", "name", "priority", "active", "action", "updatedAt",
    "supplierId"
)
SELECT
    gen_random_uuid()::text,
    s."companyId",
    'SEED-SUP-' || s."supplierCode",
    'Seeded: supplier ' || s."supplierCode" || ' requires inspection',
    80,
    true,
    'INSPECTION_REQUIRED',
    CURRENT_TIMESTAMP,
    s."id"
FROM "mm_suppliers" s
WHERE s."qualityInspectionRequired" = true
  AND NOT EXISTS (
      SELECT 1 FROM "mm_quality_inspection_rules" r
      WHERE r."companyId" = s."companyId" AND r."ruleCode" = 'SEED-SUP-' || s."supplierCode"
  );

INSERT INTO "mm_quality_inspection_rules" (
    "id", "companyId", "ruleCode", "name", "priority", "active", "action", "updatedAt",
    "supplierId", "materialId"
)
SELECT
    gen_random_uuid()::text,
    s."companyId",
    'SEED-SM-' || s."supplierCode" || '-' || m."materialCode",
    'Seeded: supplier-material ' || s."supplierCode" || '/' || m."materialCode",
    110,
    true,
    'INSPECTION_REQUIRED',
    CURRENT_TIMESTAMP,
    sm."supplierId",
    sm."materialId"
FROM "mm_supplier_materials" sm
JOIN "mm_suppliers" s ON s."id" = sm."supplierId"
JOIN "mm_materials" m ON m."id" = sm."materialId"
WHERE sm."inspectionRequired" = true
  AND sm."status" = 'ACTIVE'
  AND NOT EXISTS (
      SELECT 1 FROM "mm_quality_inspection_rules" r
      WHERE r."companyId" = s."companyId"
        AND r."ruleCode" = 'SEED-SM-' || s."supplierCode" || '-' || m."materialCode"
  );
